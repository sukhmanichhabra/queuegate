import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../redis/redis.service';
import {
  RATE_LIMIT_KEY,
  RateLimitOptions,
  RateLimitCheckOptions,
} from './rate-limit.decorator';

/**
 * Parametrized rate-limiting guard using a Redis INCR+EXPIRE pattern.
 *
 * Configuration is attached per-route via the @RateLimit() decorator.
 * When no decorator is present the guard falls back to the original
 * /events/:id/join defaults: 5 requests per 60 s keyed by ip+eventId,
 * ensuring the existing join rate limit is UNCHANGED.
 *
 * Key patterns by strategy:
 *   ip               → ratelimit:{prefix}:{ip}
 *   ip+eventId       → ratelimit:{prefix}:{ip}:{eventId}
 *   ip+email         → ratelimit:{prefix}:{ip}:{email}
 *   userId           → ratelimit:{prefix}:{userId}
 *   sessionId+eventId → ratelimit:{prefix}:{sessionId}:{eventId}
 *
 * Secondary checks:
 *   The @RateLimit() decorator supports an optional `secondaryCheck` field.
 *   When present, both the primary and secondary checks are applied — a
 *   request blocked by EITHER triggers a 429. This allows layering, e.g.:
 *     primary:   per IP+eventId   (catches a single IP flooding)
 *     secondary: per sessionId+eventId (catches IP-rotating attackers reusing a session)
 *
 * On limit breach:
 *   - Returns HTTP 429 Too Many Requests
 *   - Sets Retry-After header (seconds remaining in the window)
 *
 * On userId strategy without an authenticated user:
 *   - Returns HTTP 403 Forbidden (fails safe, never silently falls back to IP)
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly redis: RedisService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const opts = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    // ── Defaults: preserve original /join behaviour exactly ───────────────
    const primary: RateLimitCheckOptions = {
      limit: opts?.limit ?? 5,
      windowSec: opts?.windowSec ?? 60,
      keyStrategy: opts?.keyStrategy ?? 'ip+eventId',
      keyPrefix: opts?.keyPrefix ?? 'generic',
    };

    await this.applyCheck(primary, req, res);

    // ── Secondary check (optional, e.g. per-session for /join) ────────────
    if (opts?.secondaryCheck) {
      await this.applyCheck(opts.secondaryCheck, req, res);
    }

    return true;
  }

  /**
   * Apply one rate-limit check.
   * Throws HttpException 429 if the limit is exceeded.
   * Throws ForbiddenException 403 if the userId strategy is used on an
   * unauthenticated request (fails safe, never silently falls back to IP).
   */
  private async applyCheck(
    check: RateLimitCheckOptions,
    req: any,
    res: any,
  ): Promise<void> {
    const { limit, windowSec, keyStrategy, keyPrefix = 'generic' } = check;

    const ip: string =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.ip ||
      req.connection?.remoteAddress ||
      'unknown';

    // ── Build Redis key based on strategy ─────────────────────────────────
    let key: string;

    switch (keyStrategy) {
      case 'ip+eventId': {
        const eventId: string = req.params?.id ?? 'unknown';
        key = `ratelimit:${keyPrefix}:${ip}:${eventId}`;
        break;
      }

      case 'ip+email': {
        const email: string =
          (req.body?.email as string | undefined)?.toLowerCase().trim() ?? 'unknown';
        key = `ratelimit:${keyPrefix}:${ip}:${email}`;
        break;
      }

      case 'userId': {
        const userId: string | undefined = req.user?.id;
        if (!userId) {
          // Auth guard should have run first; this is a hard programming error
          // or an unauthenticated request that somehow reached this guard.
          // Fail safe with 403, never silently fall back to IP-only.
          throw new ForbiddenException(
            'Rate limit guard requires an authenticated user for this route',
          );
        }
        key = `ratelimit:${keyPrefix}:${userId}`;
        break;
      }

      case 'sessionId+eventId': {
        // sessionId comes from the request body (JoinQueueDto.sessionId).
        // If missing (malformed request), fall back to 'unknown' so the key
        // is still well-defined and rate-limiting still fires on unknown traffic.
        const sessionId: string =
          (req.body?.sessionId as string | undefined) ?? 'unknown';
        const eventId: string = req.params?.id ?? 'unknown';
        key = `ratelimit:${keyPrefix}:${sessionId}:${eventId}`;
        break;
      }

      case 'ip':
      default: {
        key = `ratelimit:${keyPrefix}:${ip}`;
        break;
      }
    }

    // ── INCR + conditional EXPIRE (atomic window) ─────────────────────────
    const current = await this.redis.client.incr(key);
    if (current === 1) {
      await this.redis.client.expire(key, windowSec);
    }

    if (current > limit) {
      // Fetch remaining TTL so we can set Retry-After accurately
      const ttl = await this.redis.client.ttl(key);
      const retryAfter = ttl > 0 ? ttl : windowSec;
      res.setHeader('Retry-After', String(retryAfter));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Try again in ${retryAfter} second(s).`,
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
