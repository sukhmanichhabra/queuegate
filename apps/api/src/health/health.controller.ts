import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { KafkaHealthConsumer } from '../admission/kafka-health.consumer';

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly kafkaHealthConsumer: KafkaHealthConsumer,
  ) {}

  @Get('health')
  getHealth(@Res() res: Response) {
    // Strictly a liveness probe: the Node process is running.
    return res.status(HttpStatus.OK).json({ status: 'ok' });
  }

  @Get('ready')
  async getReady(@Res() res: Response) {
    const checks = {
      postgres: 'fail',
      redis: 'fail',
      kafka: 'fail',
    };

    let isReady = true;

    // Helper for timeouts
    const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
      let timeoutId: NodeJS.Timeout;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      });
      try {
        return await Promise.race([promise, timeoutPromise]);
      } finally {
        clearTimeout(timeoutId!);
      }
    };

    // Postgres check
    try {
      await withTimeout(this.prisma.$queryRaw`SELECT 1`, 2000);
      checks.postgres = 'ok';
    } catch (e) {
      checks.postgres = 'fail';
      isReady = false;
    }

    // Redis check
    try {
      await withTimeout(this.redis.client.ping(), 2000);
      checks.redis = 'ok';
    } catch (e) {
      checks.redis = 'fail';
      isReady = false;
    }

    // Kafka check - soft dependency
    // Wait for the getter which returns the boolean flag from the KafkaService.
    if (this.kafkaHealthConsumer.isConnected) {
      checks.kafka = 'ok';
    } else {
      checks.kafka = 'degraded';
      // Deliberately NOT setting isReady = false.
      // Kafka is a soft dependency: QueueGate degrades gracefully.
    }

    const statusCode = isReady ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    return res.status(statusCode).json({
      status: isReady ? 'ready' : 'not_ready',
      checks,
    });
  }
}
