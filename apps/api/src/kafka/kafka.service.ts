import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import { getSecret } from '../config/secrets';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private kafka: Kafka;
  private producer: Producer;

  async onModuleInit() {
    this.kafka = new Kafka({
      clientId: 'queuegate-api',
      brokers: getSecret('KAFKA_BROKERS', 'localhost:9092').split(','),
      retry: { retries: 0 }
    });
    this.producer = this.kafka.producer();
    try {
      await this.producer.connect();
      this.logger.log('Connected to Kafka producer');
    } catch (e) {
      this.logger.error('Failed to connect to Kafka producer', e);
    }
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
  }

  async produce(topic: string, message: any) {
    try {
      await this.producer.send({
        topic,
        messages: [{ value: JSON.stringify(message) }],
      });
    } catch (e) {
      this.logger.error(`Failed to produce to topic ${topic}`, e);
    }
  }
}
