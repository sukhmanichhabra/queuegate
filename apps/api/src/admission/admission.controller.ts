import { Controller, Post, Get, Param, Body, UseGuards, Req, Query } from '@nestjs/common';
import { AdmissionService } from './admission.service';
import { JoinQueueDto } from './dto/join-queue.dto';
import { RateLimitGuard } from '../fraud/rate-limit.guard';
import { RateLimit } from '../fraud/rate-limit.decorator';

@Controller('events/:id')
export class AdmissionController {
  constructor(private readonly admissionService: AdmissionService) {}

  /**
   * POST /events/:id/join — place a shopper in the queue for an event.
   *
   * Two simultaneous rate-limit checks apply:
   *
   *   1. Per-IP+event (existing Phase 9 check, UNCHANGED):
   *      5 requests / 60 s per IP per event.
   *      Catches a single device/connection flooding the join endpoint.
   *
   *   2. Per-sessionId+event (NEW, Phase 16):
   *      5 requests / 60 s per sessionId per event.
   *      Catches an attacker rotating IPs (VPN, multiple devices) while
   *      reusing the same sessionId — the previous IP check alone would
   *      allow all such requests through.
   *
   * A request blocked by EITHER check returns 429.
   *
   * Residual gap (acknowledged):
   *   If an attacker mints a fresh sessionId per request (trivially possible
   *   since sessionId is a client-generated UUID), the per-session check is
   *   bypassed. Together the two checks significantly raise the bar — a
   *   single device is blocked by the per-IP limit, and a stationary IP
   *   reusing a session is blocked by the per-session limit — but neither
   *   alone nor both together fully close the gap against a fully adaptive
   *   attacker who rotates both IP and sessionId simultaneously. That would
   *   require event-level queue admission controls (reserved capacity,
   *   CAPTCHA, etc.) rather than rate limiting.
   */
  @Post('join')
  @UseGuards(RateLimitGuard)
  @RateLimit({
    // Primary: per-IP+event (original Phase 9 protection — UNCHANGED)
    limit: 5,
    windowSec: 60,
    keyStrategy: 'ip+eventId',
    keyPrefix: 'join',
    // Secondary: per-sessionId+event (new Phase 16 layered check)
    secondaryCheck: {
      limit: 5,
      windowSec: 60,
      keyStrategy: 'sessionId+eventId',
      keyPrefix: 'join-session',
    },
  })
  joinQueue(@Param('id') eventId: string, @Body() dto: JoinQueueDto, @Req() req: any) {
    const userId = req.user?.id;
    return this.admissionService.joinQueue(eventId, dto.sessionId, userId, dto.categoryId);
  }

  @Get('position')
  getPosition(@Param('id') eventId: string, @Query('sessionId') sessionId: string) {
    return this.admissionService.getPosition(eventId, sessionId);
  }
}
