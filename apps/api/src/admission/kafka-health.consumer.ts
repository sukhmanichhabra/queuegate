import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Kafka, Consumer } from 'kafkajs';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { QueueGateway } from '../ws-gateway/queue.gateway';
import { getSecret } from '../config/secrets';

@Injectable()
export class KafkaHealthConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaHealthConsumer.name);
  private kafka: Kafka;
  private consumer: Consumer;

  /** Exposed for /admin/kafka-health — set by onModuleInit retry loop. */
  public isConnected = false;

  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
    private gateway: QueueGateway,
  ) {}


  private createConsumer() {
    this.consumer = this.kafka.consumer({ groupId: 'admission-health-group' });

    // ── Dynamic connection-state tracking ────────────────────────────────────
    this.consumer.on(this.consumer.events.CONNECT, () => {
      this.isConnected = true;
      this.metrics.kafkaConsumerConnectedGauge.set(1);
      this.logger.log('Kafka consumer CONNECTED');
    });

    this.consumer.on(this.consumer.events.DISCONNECT, () => {
      this.isConnected = false;
      this.metrics.kafkaConsumerConnectedGauge.set(0);
      this.logger.warn('Kafka consumer DISCONNECTED');
    });

    this.consumer.on(this.consumer.events.CRASH, (event: any) => {
      this.isConnected = false;
      this.metrics.kafkaConsumerConnectedGauge.set(0);
      this.logger.error(
        `Kafka consumer CRASH — restart=${event.payload?.restart ?? false}: ${event.payload?.error?.message}`,
      );
    });
    // ─────────────────────────────────────────────────────────────────────────
  }

  async onModuleInit() {
    this.kafka = new Kafka({
      clientId: 'queuegate-health-consumer',
      brokers: getSecret('KAFKA_BROKERS', 'localhost:9092').split(','),
    });

    this.createConsumer();

    let connected = false;
    const delays = [100, 200]; // shortened for tests

    for (let i = 0; i < delays.length; i++) {
      try {
        await this.consumer.connect();
        connected = true;
        // isConnected + gauge already updated by the CONNECT listener above
        break;
      } catch (e) {
        this.logger.warn(`Kafka connection attempt ${i + 1}/${delays.length} failed, retrying in ${delays[i]}ms`);
        await new Promise((resolve) => setTimeout(resolve, delays[i]));
      }
    }

    if (!connected) {
      this.logger.error('Failed to connect Kafka consumer after retries.');
      this.isConnected = false;
      this.metrics.kafkaConsumerConnectedGauge.set(0);
      return;
    }

    try {
      await this.consumer.subscribe({ topic: 'queue.health_changed', fromBeginning: false });

      await this.consumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) return;
          try {
            const data = JSON.parse(message.value.toString());
            await this.handleHealthChange(data);
          } catch (e) {
            this.logger.error('Failed to process health message', e);
          }
        },
      });
      this.logger.log('Listening to queue.health_changed');
    } catch (e) {
      this.logger.error('Failed to start Kafka health consumer loop', e);
      this.metrics.kafkaConsumerConnectedGauge.set(0);
    }
  }


  async onModuleDestroy() {
    await this.consumer.disconnect();
  }

  private async handleHealthChange(data: { eventId: string, status: 'DEGRADED' | 'HEALTHY', reason?: string, timestamp?: string }) {
    const { eventId, status, reason = 'auto_throttle' } = data;
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    
    if (!event) return;

    if (status === 'DEGRADED') {
      const currentRate = event.admission_rate_per_min;
      const newRate = Math.ceil(currentRate / 2);

      await this.prisma.event.update({
        where: { id: eventId },
        data: { admission_rate_per_min: newRate },
      });

      await this.prisma.admissionRateLog.create({
        data: {
          event_id: eventId,
          rate: newRate,
          reason: 'auto_throttle',
        },
      });

      this.metrics.throttleActivationsCounter.inc();

      this.gateway.emitThrottleEvent(eventId, {
        eventId,
        reason: reason,
        newRate,
      });

      const queueDepth = await this.prisma.queueEntry.count({
        where: { event_id: eventId, status: 'WAITING' },
      });

      const [ticketsSold, admittedNow] = await Promise.all([
        this.prisma.queueEntry.count({
          where: { event_id: eventId, status: 'COMPLETED' },
        }),
        this.prisma.queueEntry.count({
          where: {
            event_id: eventId,
            status: 'ADMITTED',
            expires_at: { gt: new Date() },
          },
        }),
      ]);
      const totalProcessed = ticketsSold + admittedNow;
      const revenue = ticketsSold * (event.ticket_price || 0);

      this.gateway.emitMerchantStats(eventId, {
        queueDepth,
        admissionRate: newRate,
        throttleActive: true,
        ticketsSold,
        admittedNow,
        totalProcessed,
        revenue,
        capacity: event.capacity,
      });

      this.logger.log(`Auto-throttle ACTIVATED for event ${eventId}. Rate: ${currentRate} -> ${newRate}`);
    } else if (status === 'HEALTHY') {
      const restoredRate = event.baseline_admission_rate;

      await this.prisma.event.update({
        where: { id: eventId },
        data: { admission_rate_per_min: restoredRate },
      });

      await this.prisma.admissionRateLog.create({
        data: {
          event_id: eventId,
          rate: restoredRate,
          reason: 'auto_throttle',
        },
      });

      const queueDepth = await this.prisma.queueEntry.count({
        where: { event_id: eventId, status: 'WAITING' },
      });

      const [ticketsSold2, admittedNow2] = await Promise.all([
        this.prisma.queueEntry.count({
          where: { event_id: eventId, status: 'COMPLETED' },
        }),
        this.prisma.queueEntry.count({
          where: {
            event_id: eventId,
            status: 'ADMITTED',
            expires_at: { gt: new Date() },
          },
        }),
      ]);
      const totalProcessed2 = ticketsSold2 + admittedNow2;
      const revenue2 = ticketsSold2 * (event.ticket_price || 0);

      this.gateway.emitMerchantStats(eventId, {
        queueDepth,
        admissionRate: restoredRate,
        throttleActive: false,
        ticketsSold: ticketsSold2,
        admittedNow: admittedNow2,
        totalProcessed: totalProcessed2,
        revenue: revenue2,
        capacity: event.capacity,
      });

      this.logger.log(`Auto-throttle RECOVERED for event ${eventId}. Rate restored to ${restoredRate}`);
    }
  }

  async restart() {
    this.logger.log('Manually restarting Kafka consumer...');
    try {
      await this.consumer.disconnect();
    } catch (e) {
      this.logger.warn('Error disconnecting consumer during restart', e);
    }
    
    // Completely recreate the consumer to drop broken state
    this.createConsumer();
    this.isConnected = false;
    this.metrics.kafkaConsumerConnectedGauge.set(0);

    let connected = false;
    const delays = [100, 200];
    for (let i = 0; i < delays.length; i++) {
      try {
        await this.consumer.connect();
        connected = true;
        break;
      } catch (e) {
        this.logger.warn(`Kafka restart connection attempt ${i + 1}/${delays.length} failed, retrying in ${delays[i]}ms`);
        await new Promise((resolve) => setTimeout(resolve, delays[i]));
      }
    }

    if (!connected) {
      this.logger.error('Failed to reconnect Kafka consumer on manual restart.');
      return;
    }

    this.isConnected = true;
    this.metrics.kafkaConsumerConnectedGauge.set(1);

    try {
      await this.consumer.subscribe({ topic: 'queue.health_changed', fromBeginning: false });
      
      await this.consumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) return;
          try {
            const data = JSON.parse(message.value.toString());
            await this.handleHealthChange(data);
          } catch (e) {
            this.logger.error('Failed to process health message', e);
          }
        },
      });
      this.logger.log('Kafka consumer manually restarted and listening to queue.health_changed');
    } catch (e) {
      this.logger.error('Failed to start Kafka health consumer loop on manual restart', e);
      this.isConnected = false;
      this.metrics.kafkaConsumerConnectedGauge.set(0);
    }
  }
}
