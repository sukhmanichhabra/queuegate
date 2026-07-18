import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  async listEvents(status?: string, page: number = 1, limit: number = 20) {
    const validStatuses = ['DRAFT', 'ON_SALE', 'PAUSED', 'SOLD_OUT', 'ENDED'];
    const where: Prisma.EventWhereInput = {
      status: (status && validStatuses.includes(status)) ? (status as any) : { not: 'DRAFT' },
    };

    const [total, events] = await Promise.all([
      this.prisma.event.count({ where }),
      this.prisma.event.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { show_date: 'asc' },
      }),
    ]);

    if (events.length === 0) {
      return {
        data: [],
        meta: {
          total,
          page,
          limit,
          totalPages: 0,
        },
      };
    }

    // ── Batch Redis ZCARD via pipeline — one network round-trip total ─────────
    // ioredis pipeline() batches all commands and resolves to an array of
    // [error, result] tuples, so we never do N sequential Redis calls.
    let queueDepths: number[] = events.map(() => 0); // default if Redis fails
    try {
      const pipeline = this.redis.client.pipeline();
      for (const event of events) {
        pipeline.zcard(`event:${event.id}:queue`);
      }
      const results = await pipeline.exec();
      if (results) {
        queueDepths = results.map(([err, val]) => (err ? 0 : (val as number)));
      }
    } catch {
      // Redis unavailable — fall back to zeros; don't crash the list endpoint
    }

    // ── Batch admitted_count via single Postgres groupBy — one DB round-trip ──
    // Authoritative source is Postgres (not the Redis admitted_count key which
    // is an advisory counter that can drift on Redis restart).
    const admittedCountsRaw = await this.prisma.queueEntry.groupBy({
      by: ['event_id'],
      where: {
        event_id: { in: events.map((e) => e.id) },
        status: 'ADMITTED',
      },
      _count: { id: true },
    });

    const admittedByEventId = new Map(
      admittedCountsRaw.map((row) => [row.event_id, row._count.id]),
    );

    return {
      data: events.map((event, i) => ({
        ...event,
        queueDepth: queueDepths[i],
        admitted_count: admittedByEventId.get(event.id) ?? 0,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getEvent(id: string) {
    const event = await this.prisma.event.findUnique({
      where:   { id },
      include: { ticket_categories: { orderBy: { sort_order: 'asc' } } },
    });

    if (!event || event.status === 'DRAFT') {
      throw new NotFoundException('Event not found');
    }

    const [queueDepth, admittedCountResult] = await Promise.all([
      this.redis.client.zcard(`event:${id}:queue`).catch(async () =>
        this.prisma.queueEntry.count({ where: { event_id: id, status: 'WAITING' } })
      ),
      this.prisma.queueEntry.count({ where: { event_id: id, status: 'ADMITTED' } }),
    ]);

    // Enrich each category with available capacity
    const categoriesWithAvailability = await Promise.all(
      (event.ticket_categories ?? []).map(async (cat) => {
        const consumed = await this.prisma.queueEntry.count({
          where: {
            ticket_category_id: cat.id,
            status: { in: ['WAITING', 'ADMITTED', 'COMPLETED'] },
          },
        });
        return {
          ...cat,
          availableCapacity: Math.max(0, cat.capacity - consumed),
          soldOut: consumed >= cat.capacity,
        };
      }),
    );

    return {
      ...event,
      ticket_categories: categoriesWithAvailability,
      queueDepth,
      admitted_count: admittedCountResult,
    };
  }

  async getRateLogs(eventId: string, limit: number = 20) {
    return this.prisma.admissionRateLog.findMany({
      where: { event_id: eventId },
      orderBy: { changed_at: 'desc' },
      take: limit,
    });
  }

  async getMyTickets(userId?: string, sessionId?: string) {
    if (!userId && !sessionId) {
      return [];
    }

    const whereClauses: Prisma.QueueEntryWhereInput[] = [];
    if (userId) whereClauses.push({ user_id: userId });
    if (sessionId) whereClauses.push({ session_id: sessionId });

    return this.prisma.queueEntry.findMany({
      where: {
        status: 'COMPLETED',
        OR: whereClauses,
      },
      include: {
        event: true,
        ticket_category: true,
      },
      orderBy: {
        checkout_completed_at: 'desc',
      },
    });
  }
}

