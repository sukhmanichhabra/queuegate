import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { KafkaService } from '../kafka/kafka.service';
import { EtaService } from './eta.service';
import { requireEnv } from '../env';

@Injectable()
export class AdmissionService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private kafka: KafkaService,
    private etaService: EtaService,
    private jwtService: JwtService,
  ) {}

  async joinQueue(eventId: string, sessionId: string, userId?: string, categoryId?: string) {
    const event = await this.prisma.event.findUnique({
      where:   { id: eventId },
      include: { ticket_categories: true },
    });
    if (!event || event.status !== 'ON_SALE') {
      throw new NotFoundException('Event not found or not ON_SALE');
    }

    // ── Category validation ──────────────────────────────────────────────────
    let resolvedCategoryId: string | undefined = categoryId;

    if (event.ticket_categories.length > 0) {
      // Event has categories — category selection is required
      if (!categoryId) {
        throw new BadRequestException('This event requires a ticket category selection');
      }

      const category = event.ticket_categories.find((c) => c.id === categoryId);
      if (!category) {
        throw new BadRequestException('Invalid ticket category for this event');
      }

      // Check category capacity
      const consumed = await this.prisma.queueEntry.count({
        where: {
          ticket_category_id: categoryId,
          status: { in: ['WAITING', 'ADMITTED', 'COMPLETED'] },
        },
      });
      if (consumed >= category.capacity) {
        throw new ConflictException(`Category "${category.name}" is sold out`);
      }
    } else {
      // No categories on this event — ignore any passed categoryId
      resolvedCategoryId = undefined;
    }

    // ── Existing entry cleanup ───────────────────────────────────────────────
    const existing = await this.prisma.queueEntry.findFirst({
      where: { event_id: eventId, session_id: sessionId },
    });
    if (existing) {
      const isTerminal =
        existing.status === 'EXPIRED' ||
        existing.status === 'COMPLETED' ||
        (existing.status === 'ADMITTED' &&
          existing.expires_at !== null &&
          existing.expires_at < new Date());

      if (isTerminal) {
        await this.prisma.queueEntry.delete({ where: { id: existing.id } });
        await this.redis.client.zrem(`event:${eventId}:queue`, sessionId);
      } else {
        throw new ConflictException('Session already in queue for this event');
      }
    }

    // ── Create entry ─────────────────────────────────────────────────────────
    await this.prisma.queueEntry.create({
      data: {
        event_id:           eventId,
        session_id:         sessionId,
        user_id:            userId,
        status:             'WAITING',
        ticket_category_id: resolvedCategoryId,
      },
    });
    const nowMs = Date.now();
    await this.redis.client.zadd(`event:${eventId}:queue`, nowMs, sessionId);

    const queueDepth = await this.redis.client.zcard(`event:${eventId}:queue`);

    await this.kafka.produce('queue.joined', {
      eventId,
      sessionId,
      userId,
      categoryId: resolvedCategoryId,
      joinedAt: new Date(nowMs).toISOString(),
      queueDepth,
    });

    const etaSeconds = await this.etaService.computeETA(eventId, sessionId);
    const rank       = await this.redis.client.zrank(`event:${eventId}:queue`, sessionId);
    const position   = rank !== null ? rank + 1 : 0;

    const wsToken = await this.jwtService.signAsync(
      { eventId, sessionId },
      { secret: requireEnv('JWT_WS_SECRET'), expiresIn: '5m' },
    );

    return { position, total: queueDepth, etaSeconds, status: 'WAITING', wsToken };
  }

  async getPosition(eventId: string, sessionId: string) {
    const entry = await this.prisma.queueEntry.findFirst({
      where:   { event_id: eventId, session_id: sessionId },
      include: { ticket_category: true },
    });

    if (!entry) throw new NotFoundException('Session not found in queue');

    let etaSeconds = 0;
    let position   = 0;
    const total    = await this.redis.client.zcard(`event:${eventId}:queue`);

    if (entry.status === 'WAITING') {
      const eta = await this.etaService.computeETA(eventId, sessionId);
      if (eta !== null) {
        etaSeconds = eta;
        const rank = await this.redis.client.zrank(`event:${eventId}:queue`, sessionId);
        position   = rank !== null ? rank + 1 : 0;
      }
    }

    return {
      position,
      total,
      etaSeconds,
      status:           entry.status,
      categoryId:       entry.ticket_category_id,
      categoryName:     entry.ticket_category?.name,
      categoryPrice:    entry.ticket_category?.price,
      categoryColor:    entry.ticket_category?.color,
      ...(entry.status === 'ADMITTED' && {
        checkoutToken: await this.jwtService.signAsync(
          { sub: entry.user_id || undefined, sessionId: entry.session_id, eventId },
          { secret: requireEnv('JWT_ACCESS_SECRET'), expiresIn: '10m', jwtid: entry.checkout_token_jti || undefined }
        ),
        expiresAt: entry.expires_at,
        entryId:   entry.id,
        // Pass category info through to checkout
        categoryId:    entry.ticket_category_id,
        categoryName:  entry.ticket_category?.name,
        categoryPrice: entry.ticket_category?.price,
        categoryColor: entry.ticket_category?.color,
      }),
    };
  }
}
