import {
  Injectable,
  ServiceUnavailableException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { KafkaService } from '../kafka/kafka.service';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { MerchantService } from '../merchant/merchant.service';
import { QueueGateway } from '../ws-gateway/queue.gateway';
import { requireEnv } from '../env';

@Injectable()
export class MockCheckoutService {
  private degradedEvents: Set<string> = new Set();

  constructor(
    private kafka: KafkaService,
    private prisma: PrismaService,
    private metrics: MetricsService,
    private jwtService: JwtService,
    private merchantService: MerchantService,
    private gateway: QueueGateway,
  ) {}

  async injectFailure(eventId: string) {
    this.degradedEvents.add(eventId);
    await this.kafka.produce('queue.health_changed', {
      eventId,
      status: 'DEGRADED',
      reason: 'mock_failure_injected',
      timestamp: new Date().toISOString(),
    });
    return { success: true, eventId, state: 'DEGRADED' };
  }

  async clearFailure(eventId: string) {
    this.degradedEvents.delete(eventId);
    await this.kafka.produce('queue.health_changed', {
      eventId,
      status: 'HEALTHY',
      reason: 'mock_failure_cleared',
      timestamp: new Date().toISOString(),
    });
    return { success: true, eventId, state: 'HEALTHY' };
  }

  /**
   * Complete a shopper's checkout and mark their QueueEntry as COMPLETED.
   *
   * Ownership verification:
   *   The caller must present the checkoutToken that was issued at admission
   *   time (signed JWT with payload { sub, sessionId, eventId }). We verify:
   *     1. The JWT signature is valid (proves the server issued it — unforgeable).
   *     2. The token's JTI matches the checkout_token_jti stored on the
   *        QueueEntry for this entryId (proves this token belongs to THIS entry,
   *        not any other admitted entry).
   *
   *   Why not plain sessionId string comparison?
   *     sessionIds are client-generated UUIDs. An attacker who learns or guesses
   *     a victim's sessionId can submit it directly. The signed token is
   *     cryptographically bound to the server's JWT_ACCESS_SECRET and cannot
   *     be fabricated without it.
   *
   *   We return 403 (not 404) on mismatch. A 404 would reveal whether the
   *   entryId exists at all; a 403 reveals only that the caller lacks proof
   *   of ownership, which is the accurate and less-informative response.
   */
  async completeCheckout(entryId: string, eventId: string, checkoutToken: string) {
    // ── Step 1: Verify the JWT signature and extract the JTI ────────────────
    let tokenPayload: any;
    try {
      tokenPayload = await this.jwtService.verifyAsync(checkoutToken, {
        secret: requireEnv('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new ForbiddenException(
        'Invalid or expired checkout token — ownership could not be verified',
      );
    }

    const tokenJti: string | undefined = tokenPayload?.jti;
    if (!tokenJti) {
      throw new ForbiddenException(
        'Checkout token is missing required identity fields',
      );
    }

    // ── Step 2: Look up the QueueEntry ─────────────────────────────────────
    const entry = await this.prisma.queueEntry.findUnique({
      where: { id: entryId },
    });

    if (!entry) {
      // Still 403 rather than 404 — consistent "you don't own this" response
      // that doesn't distinguish "not found" from "found but wrong token".
      throw new ForbiddenException(
        'Checkout token does not match this entry — ownership could not be verified',
      );
    }

    // ── Step 3: Compare token JTI against stored checkout_token_jti ─────────
    if (entry.checkout_token_jti !== tokenJti) {
      throw new ForbiddenException(
        'Checkout token does not match this entry — ownership could not be verified',
      );
    }

    // ── Step 4: Guard against replay / non-ADMITTED entries ────────────────
    // Reject with 409 (not 200, not 403) when the entry has already been
    // completed — a 409 tells the client "this is already done", whereas a
    // 403 would incorrectly imply an auth/ownership problem.
    if (entry.status === 'COMPLETED') {
      throw new ConflictException(
        'Checkout already completed for this entry — duplicate submission rejected',
      );
    }

    // Reject non-ADMITTED entries (e.g. EXPIRED, still WAITING) with 403.
    // They passed the JTI check but the window has closed or they were never
    // admitted — this is an ownership-adjacent denial, so 403 is accurate.
    if (entry.status !== 'ADMITTED') {
      throw new ForbiddenException(
        'Entry is not in ADMITTED status — checkout not permitted',
      );
    }

    // ── Step 5: Normal degraded-checkout path ────────────────────────────────
    if (this.degradedEvents.has(eventId)) {
      this.metrics.checkoutErrorsCounter.inc({ event_id: eventId });
      throw new ServiceUnavailableException('Checkout service is degraded');
    }

    await this.prisma.queueEntry.update({
      where: { id: entryId },
      data: {
        status: 'COMPLETED',
        checkout_completed_at: new Date(),
      },
    });

    // Fire off stats update to merchant dashboard so it reflects immediately
    const stats = await this.merchantService.getEventStatsInternal(eventId);
    this.gateway.emitMerchantStats(eventId, {
      queueDepth: stats.queueDepth,
      admissionRate: stats.admissionRatePerMin || 60,
      throttleActive: this.degradedEvents.has(eventId),
      ticketsSold: stats.ticketsSold,
      admittedNow: stats.admittedNow,
      totalProcessed: stats.totalProcessed,
      revenue: stats.revenue,
      capacity: stats.capacity,
    });

    return { success: true, status: 'COMPLETED' };
  }

  getHealth(eventId: string) {
    const isDegraded = this.degradedEvents.has(eventId);
    return { status: isDegraded ? 'DEGRADED' : 'HEALTHY' };
  }
}
