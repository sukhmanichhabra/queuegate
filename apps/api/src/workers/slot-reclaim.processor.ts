import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { QueueGateway } from '../ws-gateway/queue.gateway';
import { MetricsService } from '../metrics/metrics.service';

@Processor('slot_reclaim')
export class SlotReclaimProcessor extends WorkerHost {
  private readonly logger = new Logger(SlotReclaimProcessor.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private gateway: QueueGateway,
    private metrics: MetricsService,
  ) {
    super();
  }

  async process(job: Job<{ entryId: string, eventId: string }, any, string>): Promise<any> {
    const { entryId, eventId } = job.data;

    const entry = await this.prisma.queueEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.status !== 'ADMITTED') {
      return;
    }

    await this.prisma.queueEntry.update({
      where: { id: entryId },
      data: { status: 'EXPIRED' }
    });

    const queueDepth = await this.redis.client.zcard(`event:${eventId}:queue`);
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    
    this.metrics.queueDepthGauge.set({ event_id: eventId }, queueDepth);
    
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
    const revenue = ticketsSold * (event?.ticket_price || 0);

    this.gateway.emitMerchantStats(eventId, {
      queueDepth,
      admissionRate: event?.admission_rate_per_min || 60,
      throttleActive: false,
      ticketsSold,
      admittedNow,
      totalProcessed,
      revenue,
      capacity: event?.capacity || 0,
    });
    
    this.logger.log(`Reclaimed expired slot for entry ${entryId}`);
  }
}
