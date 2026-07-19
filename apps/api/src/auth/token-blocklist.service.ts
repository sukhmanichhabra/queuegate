import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/**
 * TokenBlocklistService — shared helper for access-token revocation.
 *
 * Key schema: `blocklist:access:{jti}`  value: '1'
 * TTL: remaining lifetime of the token at the moment of logout.
 *
 * Injected by both JwtStrategy (HTTP path) and QueueGateway (WS path)
 * so the blocklist check is identical regardless of transport.
 */
@Injectable()
export class TokenBlocklistService {
  private readonly PREFIX = 'blocklist:access:';

  constructor(private readonly redis: RedisService) {}

  /**
   * Returns true if the given jti is on the blocklist (i.e. the token was
   * explicitly revoked before its natural expiry).
   *
   * A missing or undefined jti (tokens issued before this change was deployed)
   * is NOT treated as revoked — they pass through and expire naturally within
   * their original 15-minute window.
   */
  async isRevoked(jti: string | undefined): Promise<boolean> {
    if (!jti) return false;
    try {
      const result = await this.redis.client.get(`${this.PREFIX}${jti}`);
      return result !== null;
    } catch {
      // Redis unavailable — fail open (allow the request) rather than crashing
      return false;
    }
  }

  /**
   * Adds a jti to the blocklist with a TTL matching the token's remaining
   * lifetime so the key self-expires at the same moment the token would have.
   *
   * @param jti       The JWT ID claim from the access token.
   * @param expSec    The `exp` claim value (Unix timestamp in seconds).
   */
  async revoke(jti: string | undefined, expSec: number | undefined): Promise<void> {
    if (!jti || expSec === undefined) return;

    const remainingSec = Math.floor(expSec - Date.now() / 1000);

    // Skip write if the token is already expired — nothing to revoke.
    // Never write a zero or negative TTL to Redis.
    if (remainingSec <= 0) return;

    try {
      await this.redis.client.set(`${this.PREFIX}${jti}`, '1', 'EX', remainingSec);
    } catch {
      // Redis unavailable — revocation skipped; token will expire naturally
    }
  }
}
