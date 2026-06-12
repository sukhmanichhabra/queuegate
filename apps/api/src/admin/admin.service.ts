import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaHealthConsumer } from '../admission/kafka-health.consumer';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private kafkaConsumer: KafkaHealthConsumer,
  ) {}

  /** GET /admin/events — all events across all merchants, newest first. */
  async listAllEvents() {
    return this.prisma.event.findMany({
      orderBy: { created_at: 'desc' },
      include: { merchant: true },
    });
  }

  /** GET /admin/events/:id/rate-log — last 50 entries, newest first. */
  async getRateLog(eventId: string) {
    return this.prisma.admissionRateLog.findMany({
      where: { event_id: eventId },
      orderBy: { changed_at: 'desc' },
      take: 50,
    });
  }

  /**
   * GET /admin/kafka-health — real consumer connection state.
   *
   * NOTE: kafkajs does not expose consumer-group lag (committed offset vs.
   * log-end offset) via its Consumer API. Obtaining lag would require opening
   * a separate Kafka Admin client, calling describeGroups() + listOffsets(),
   * and computing the difference — which is a non-trivial addition outside
   * this phase's scope. The `lag` field is therefore reported as null with an
   * explicit explanation rather than fabricated.
   */
  getKafkaHealth() {
    return {
      connected: this.kafkaConsumer.isConnected,
      groupId: 'admission-health-group',
      topic: 'queue.health_changed',
      lag: null,
      lagNote:
        'Consumer-group lag is not available via the kafkajs Consumer API without a separate Admin client. Set to null rather than fabricating a value.',
    };
  }

  async restartKafkaConsumer() {
    await this.kafkaConsumer.restart();
    return { success: true };
  }
}
