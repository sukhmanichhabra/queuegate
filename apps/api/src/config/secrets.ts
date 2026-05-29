/**
 * secrets.ts — Single abstraction point for loading configuration secrets.
 *
 * This module is the ONLY place in the application that should read
 * directly from process.env for secrets. If we migrate to a secret manager
 * (e.g., AWS Secrets Manager, HashiCorp Vault, Doppler), we only need to
 * update the getSecret() implementation here.
 *
 * For local development, process.env is populated from the .env file.
 */

export function getSecret(key: string): string | undefined;
export function getSecret(key: string, defaultValue: string): string;
export function getSecret(key: string, defaultValue?: string): string | undefined {
  return process.env[key] ?? defaultValue;
}

export function getSecretRequired(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === null) {
    throw new Error(`Required secret "${key}" is not set.`);
  }
  return value;
}
