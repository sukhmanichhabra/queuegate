import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

/**
 * keyStrategy determines how the Redis key is built:
 *   'ip'              → ratelimit:{prefix}:{ip}
 *   'ip+eventId'      → ratelimit:{prefix}:{ip}:{eventId}       (params.id)
 *   'ip+email'        → ratelimit:{prefix}:{ip}:{email}         (body.email)
 *   'userId'          → ratelimit:{prefix}:{userId}             (req.user.id — auth-only routes)
 *   'sessionId+eventId' → ratelimit:{prefix}:{sessionId}:{eventId}  (body.sessionId + params.id)
 */
export type RateLimitKeyStrategy =
  | 'ip'
  | 'ip+eventId'
  | 'ip+email'
  | 'userId'
  | 'sessionId+eventId';

export interface RateLimitCheckOptions {
  /** Maximum number of requests allowed within the window. */
  limit: number;
  /** Sliding window duration in seconds. */
  windowSec: number;
  /** How to build the Redis key. */
  keyStrategy: RateLimitKeyStrategy;
  /**
   * Optional string inserted between the namespace and the dynamic key
   * segments, e.g. 'login' → ratelimit:login:{ip}:{email}.
   * Defaults to 'generic' when omitted.
   */
  keyPrefix?: string;
}

export interface RateLimitOptions extends RateLimitCheckOptions {
  /**
   * Optional second rate-limit check applied to the same request.
   * Both checks must pass — either one triggering causes a 429.
   *
   * Use case: layering a per-session check on top of the primary per-IP check
   * so that an attacker rotating IPs while reusing a sessionId is still caught.
   *
   * @example
   * @RateLimit({
   *   limit: 5, windowSec: 60, keyStrategy: 'ip+eventId', keyPrefix: 'join',
   *   secondaryCheck: { limit: 5, windowSec: 60, keyStrategy: 'sessionId+eventId', keyPrefix: 'join-session' }
   * })
   */
  secondaryCheck?: RateLimitCheckOptions;
}

/**
 * Attach rate-limit configuration to a route handler or controller class.
 * Must be used in combination with RateLimitGuard.
 *
 * @example
 * \@Post('login')
 * \@UseGuards(RateLimitGuard)
 * \@RateLimit({ limit: 5, windowSec: 900, keyStrategy: 'ip+email', keyPrefix: 'login' })
 * login(@Body() dto: LoginDto) { ... }
 */
export const RateLimit = (opts: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, opts);
