import { Logger } from '@nestjs/common';
import { getSecret } from './config/secrets';

/**
 * CORS allowed origins — single source of truth for both HTTP (main.ts)
 * and WebSocket (@WebSocketGateway in queue.gateway.ts).
 *
 * Configuration:
 *   CORS_ORIGINS=https://app.example.com,https://www.example.com
 *
 * When CORS_ORIGINS is unset or blank, falls back to the localhost
 * defaults so local development works with zero config changes.
 *
 * When set, OVERRIDES the defaults entirely (does not append).
 * Rationale: production environments must be explicit about which origins
 * are allowed — silently including localhost alongside a production domain
 * is a security antipattern.
 *
 * An empty or malformed value (e.g. just whitespace after splitting)
 * triggers a warning and falls back to defaults rather than starting
 * with origin: [] which would silently reject every cross-origin request.
 */

const DEFAULT_ORIGINS: string[] = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

function resolveAllowedOrigins(): string[] {
  const raw = getSecret('CORS_ORIGINS');

  if (!raw || raw.trim() === '') {
    // Env var absent or blank — use defaults (local dev mode)
    return DEFAULT_ORIGINS;
  }

  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (parsed.length === 0) {
    new Logger('CorsConfig').warn(
      'CORS_ORIGINS is set but contains no valid origins after parsing. ' +
      'Falling back to default localhost origins. ' +
      'Check your CORS_ORIGINS env var format: comma-separated URLs.',
    );
    return DEFAULT_ORIGINS;
  }

  return parsed;
}

export const ALLOWED_ORIGINS: string[] = resolveAllowedOrigins();
