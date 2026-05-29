/**
 * env.ts — Centralized startup environment validation.
 *
 * Call validateEnv() once at the very top of main.ts, before NestJS
 * bootstraps any modules. If any required secret is absent or still set
 * to a known placeholder value, the process exits with a clear, actionable
 * error message — rather than starting up and failing mysteriously later
 * when JWT signing/verification first executes.
 *
 * Rule: no module is allowed to carry its own `|| 'fallback'` default
 * for secret-class variables. Infrastructure defaults (PORT, etc.) are
 * fine; secrets are not.
 */

import { getSecret } from './config/secrets';

/** Known placeholder values that developers forget to replace. */
const PLACEHOLDER_VALUES = new Set([
  'changeme',
  'changeme_ws',
  'secret',
  'refresh_secret',
  'your-secret-here',
  'replace-me',
  '',
]);

interface EnvVarSpec {
  name: string;
  /** If true, the process crashes on missing/placeholder in ALL environments. */
  alwaysRequired: boolean;
  /** If true, the process crashes on missing/placeholder in production ONLY. */
  productionRequired: boolean;
  /** Human-readable description shown in the error message. */
  hint: string;
}

const ENV_SPECS: EnvVarSpec[] = [
  {
    name: 'JWT_ACCESS_SECRET',
    alwaysRequired: true,
    productionRequired: true,
    hint: 'Generate with: openssl rand -hex 32',
  },
  {
    name: 'JWT_REFRESH_SECRET',
    alwaysRequired: true,
    productionRequired: true,
    hint: 'Generate with: openssl rand -hex 32 (must differ from JWT_ACCESS_SECRET)',
  },
  {
    name: 'JWT_WS_SECRET',
    alwaysRequired: true,
    productionRequired: true,
    hint: 'Generate with: openssl rand -hex 32 (must differ from JWT_ACCESS_SECRET)',
  },
  {
    name: 'DATABASE_URL',
    alwaysRequired: true,
    productionRequired: true,
    hint: 'e.g. postgresql://user:password@host:5432/dbname',
  },
  {
    name: 'REDIS_URL',
    alwaysRequired: true,
    productionRequired: true,
    hint: 'e.g. redis://localhost:6379',
  },
  {
    name: 'CORS_ORIGINS',
    alwaysRequired: false,
    productionRequired: true,
    hint: 'Comma separated list of allowed origins. e.g., https://my-frontend.com',
  },
];

/**
 * Validates all required environment variables at startup.
 * Throws an Error (caught by bootstrap) if any are missing or
 * set to a known placeholder value.
 */
export function validateEnv(): void {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = getSecret('NODE_ENV') === 'production';

  for (const spec of ENV_SPECS) {
    const isRequiredNow = spec.alwaysRequired || (spec.productionRequired && isProduction);
    const value = getSecret(spec.name);

    if (value === undefined || value === null) {
      if (isRequiredNow) {
        errors.push(`  ✗ ${spec.name} is not set.\n    Hint: ${spec.hint}`);
      } else {
        warnings.push(`  ! ${spec.name} is not set. Using dev default.\n    Hint: ${spec.hint}`);
      }
      continue;
    }

    if (PLACEHOLDER_VALUES.has(value.trim())) {
      if (isRequiredNow) {
        errors.push(`  ✗ ${spec.name} is set to a known placeholder value ("${value}").\n    Replace it with a real secret. Hint: ${spec.hint}`);
      } else {
        warnings.push(`  ! ${spec.name} is set to a placeholder value ("${value}"). Using dev default.\n    Hint: ${spec.hint}`);
      }
    }
  }

  if (warnings.length > 0 && !isProduction) {
    console.warn(`\nSTARTUP WARNINGS — Using safe defaults for missing optional variables:\n\n${warnings.join('\n\n')}\n`);
  }

  if (errors.length > 0) {
    const separator = '═'.repeat(60);
    throw new Error(
      `\n${separator}\n` +
      `STARTUP FAILED — Missing or insecure environment variables:\n\n` +
      errors.join('\n\n') +
      `\n\n${separator}\n` +
      `Copy apps/api/.env.example to apps/api/.env and fill in all values.\n` +
      separator,
    );
  }
}

/**
 * Reads a required env var by name. Throws immediately if it is absent
 * or a placeholder — use this at injection points as a belt-and-suspenders
 * guard after validateEnv() already ran at startup.
 */
export function requireEnv(name: string): string {
  const value = getSecret(name);
  if (!value || PLACEHOLDER_VALUES.has(value.trim())) {
    throw new Error(
      `Required environment variable "${name}" is missing or set to a placeholder. ` +
      `Ensure validateEnv() ran at startup and check your .env file.`,
    );
  }
  return value;
}
