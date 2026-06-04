import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { JwtService } from '@nestjs/jwt';
import { QueueGateway } from '../ws-gateway/queue.gateway';
import { MetricsService } from '../metrics/metrics.service';
import { requireEnv } from '../env';
import { randomUUID } from 'crypto';

@Processor('admission_tick')
@Injectable()
export class AdmissionTickProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(AdmissionTickProcessor.name);

  constructor(
    @InjectQueue('admission_tick') private tickQueue: Queue,
    @InjectQueue('slot_reclaim') private reclaimQueue: Queue,
    private prisma: PrismaService,
    private redis: RedisService,
    private jwt: JwtService,
    private gateway: QueueGateway,
    private metrics: MetricsService,
  ) {
    super();
  }

  // ─── Bootstrap: register tick jobs for any events already ON_SALE ───────────
  async onModuleInit() {
    // ── Step 1: Purge ALL existing repeatable jobs for this queue ────────────
    // On every restart, stale repeatable jobs accumulate in BullMQ/Redis for
    // event IDs that no longer exist in Postgres.  These ghost jobs run every
    // 2 s, query Postgres, find nothing, and spam WARNs — while the real
    // ON_SALE events may have no tick job at all.  Wiping and re-registering
    // from the actual DB state on every startup keeps the two in sync.
    const existingRepeatables = await this.tickQueue.getRepeatableJobs();
    await Promise.all(
      existingRepeatables.map((job) =>
        this.tickQueue
          .removeRepeatableByKey(job.key)
          .catch((err) =>
            this.logger.warn(`Failed to remove repeatable job ${job.key}: ${err.message}`),
          ),
      ),
    );
    if (existingRepeatables.length > 0) {
      this.logger.log(
        `Bootstrap: purged ${existingRepeatables.length} stale repeatable job(s) from previous run`,
      );
    }

    // ── Step 2: Re-register tick jobs for every currently ON_SALE event ──────
    const onSaleEvents = await this.prisma.event.findMany({
      where: { status: 'ON_SALE' },
      select: { id: true },
    });

    for (const event of onSaleEvents) {
      await this.registerEventJob(event.id);
    }

    if (onSaleEvents.length > 0) {
      this.logger.log(
        `Bootstrap: registered tick jobs for ${onSaleEvents.length} ON_SALE event(s): ` +
        onSaleEvents.map(e => e.id).join(', '),
      );
    }
  }

  // ─── Public API: called by MerchantService on status transitions ─────────────

  /**
   * Register a 2-second repeatable tick job for a single event.
   * Idempotent: BullMQ de-duplicates by jobId, so calling twice is safe.
   */
  async registerEventJob(eventId: string): Promise<void> {
    await this.tickQueue.add(
      'tick',
      { eventId },
      {
        repeat: { every: 2000 },
        jobId: `admission-tick:${eventId}`,
      },
    );
    this.logger.log(`Tick job registered for event ${eventId}`);
  }

  /**
   * Remove the repeatable tick job for a single event.
   * Idempotent: if the job doesn't exist, this is a no-op (does not throw).
   */
  async removeEventJob(eventId: string): Promise<void> {
    try {
      // removeRepeatable needs the exact repeat options and the job name
      await this.tickQueue.removeRepeatable('tick', { every: 2000 }, `admission-tick:${eventId}`);
      this.logger.log(`Tick job removed for event ${eventId}`);
    } catch (err) {
      // If the job was already removed or never existed, swallow silently
      this.logger.warn(`removeEventJob: no-op for event ${eventId} (already removed or never existed)`);
    }
  }

  // ─── BullMQ processor entry-point ────────────────────────────────────────────

  async process(job: Job<{ eventId: string }, any, string>): Promise<any> {
    const { eventId } = job.data;
    if (!eventId) {
      this.logger.warn('Tick job received without eventId — skipping');
      return;
    }

    const event = await this.prisma.event.findUnique({ 
      where: { id: eventId },
      include: { ticket_categories: true }
    });
    // If the event no longer exists or is no longer ON_SALE, skip silently.
    // This handles the race where a pause/removal is in flight mid-tick.
    if (!event || event.status !== 'ON_SALE') {
      this.logger.warn(`Tick skipped: event ${eventId} is not ON_SALE (status=${event?.status ?? 'not found'})`);
      return;
    }

    await this.processEvent(event);
  }

  // ─── Per-event tick logic ─────────────────────────────────────────────────────

  private async processEvent(event: any) {
    const lockKey = `event:${event.id}:lock`;
    const lock = await this.redis.client.set(lockKey, '1', 'PX', 2000, 'NX');
    if (!lock) return;

    try {
      const slotsThisTick = Math.ceil((event.admission_rate_per_min || 60) / 30);
      const capacity = event.capacity;

      const queueKey = `event:${event.id}:queue`;
      const countKey = `event:${event.id}:admitted_count`;

      let admittedSessions: string[] = [];
      try {
        admittedSessions = await this.redis.client.evalsha(
          this.redis.admitLuaSha,
          2,
          queueKey,
          countKey,
          slotsThisTick,
          capacity,
        ) as string[];
      } catch (e) {
        this.logger.error('Lua script failed', e);
        return;
      }

      if (admittedSessions.length > 0) {
        await this.handleAdmissions(event, admittedSessions);
      }

      // ── Business metrics for merchant dashboard ──────────────────────────
      // Query in parallel to keep latency low. Includes newly admitted sessions.
      const [ticketsSold, admittedNow] = await Promise.all([
        this.prisma.queueEntry.count({
          where: { event_id: event.id, status: 'COMPLETED' },
        }),
        this.prisma.queueEntry.count({
          where: {
            event_id: event.id,
            status: 'ADMITTED',
            expires_at: { gt: new Date() },
          },
        }),
      ]);
      const totalProcessed = ticketsSold + admittedNow;
      const completedGroups = await this.prisma.queueEntry.groupBy({
        by: ['ticket_category_id'],
        where: { event_id: event.id, status: 'COMPLETED' },
        _count: { id: true },
      });
      
      let revenue = 0;
      if (event.ticket_categories && event.ticket_categories.length > 0) {
        revenue = completedGroups.reduce((sum, group) => {
          const cat = event.ticket_categories.find((c: any) => c.id === group.ticket_category_id);
          const price = cat ? cat.price : (event.ticket_price || 0);
          return sum + (group._count.id * price);
        }, 0);
      } else {
        revenue = ticketsSold * (event.ticket_price || 0);
      }

      // ── Capacity-exhaustion check ────────────────────────────────────────────
      // If we've hit or exceeded capacity, transition to SOLD_OUT and stop ticking.
      if (totalProcessed >= event.capacity) {
        // Transition event → SOLD_OUT (idempotent: 0-row update if already SOLD_OUT)
        await this.prisma.event.update({
          where: { id: event.id },
          data: { status: 'SOLD_OUT' },
        });

        this.logger.log(
          `Event ${event.id} reached capacity (processed=${totalProcessed}/${event.capacity}) — transitioning to SOLD_OUT`,
        );

        // Notify all connected clients (merchants + shoppers)
        this.gateway.server
          .to(`event:${event.id}`)
          .emit('event:sold_out', { eventId: event.id, timestamp: new Date() });

        // Stop this event's repeatable tick job
        await this.removeEventJob(event.id);

        return; // Skip AdmissionRateLog, metrics, WS updates — no longer needed
      }
      // ────────────────────────────────────────────────────────────────────────

      const queueDepth = await this.redis.client.zcard(queueKey);
      const admissionRate = event.admission_rate_per_min || 60;



      this.metrics.queueDepthGauge.set({ event_id: event.id }, queueDepth);
      this.metrics.admissionRateGauge.set({ event_id: event.id }, admissionRate);

      this.gateway.emitMerchantStats(event.id, {
        queueDepth,
        admissionRate,
        throttleActive: false,
        ticketsSold,
        admittedNow,
        totalProcessed,
        revenue,
        capacity: event.capacity,
      });

      // Recompute ETA config in Redis
      const etaSeconds = Math.ceil((queueDepth / admissionRate) * 60);
      await this.redis.client.setex(`event:${event.id}:eta`, 5, etaSeconds.toString());

      // Broadcast generic position update signal (clients will recalculate/refetch)
      this.gateway.server.to(`event:${event.id}`).emit('queue:position_update', {
        total: queueDepth,
        etaSeconds,
        position: queueDepth, // placeholder for broadcast
      });

      this.logger.verbose(`Tick complete for event ${event.id} — depth=${queueDepth}, admitted=${admittedSessions.length}, ticketsSold=${ticketsSold}, totalProcessed=${totalProcessed}`);
    } finally {
      // CHANGE 2 — explicit lock release: don't hold for the full 2000ms TTL
      // when processing finishes in ~50ms. This unblocks the next tick sooner.
      await this.redis.client.del(lockKey);
    }
  }

  private async handleAdmissions(event: any, sessionIds: string[]) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

    const entries = await this.prisma.queueEntry.findMany({
      where: { event_id: event.id, session_id: { in: sessionIds } },
    });

    for (const entry of entries) {
      // Generate a unique jti BEFORE signing so we can store it directly
      // without having to decode the token afterwards.  This ensures the
      // issued JWT always carries a jti claim that completeCheckout can
      // verify — fixing the P0 bug confirmed by Phase 25's real E2E test.
      const jti = randomUUID();

      const checkoutToken = await this.jwt.signAsync(
        { sub: entry.user_id, sessionId: entry.session_id, eventId: event.id },
        { secret: requireEnv('JWT_ACCESS_SECRET'), expiresIn: '10m', jwtid: jti },
      );

      await this.prisma.queueEntry.update({
        where: { id: entry.id },
        data: {
          status: 'ADMITTED',
          admitted_at: now,
          expires_at: expiresAt,
          checkout_token_jti: jti,
        },
      });

      this.gateway.emitAdmitted(event.id, entry.session_id, {
        checkoutToken,
        expiresAt: expiresAt.toISOString(),
        entryId: entry.id,
      });

      await this.reclaimQueue.add('reclaim', { entryId: entry.id, eventId: event.id }, {
        delay: 10 * 60 * 1000,
        jobId: `reclaim-${entry.id}`,
      });
    }
  }
}
