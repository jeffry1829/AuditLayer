import { createHash, randomUUID } from 'node:crypto';

import { canonicalize } from '@auditlayer/schema';

import { AuditLayerConfigError, AuditLayerSchemaError, ERROR_CODES } from './errors.js';

const SAFE_PATH_SEGMENT = /^[A-Za-z0-9._-]+$/;

/**
 * Reject any string that contains characters not safe for use as a path or
 * S3 key segment. Prevents directory-traversal / key-injection via untrusted
 * `systemId` / `callId` / `caseId` values that flow through to storage layout.
 */
export function assertSafePathSegment(value: string, label: string): string {
  if (!value || !SAFE_PATH_SEGMENT.test(value) || value === '.' || value === '..') {
    throw new AuditLayerConfigError(
      ERROR_CODES.LOGGER_PATH_SEGMENT_UNSAFE,
      `${label} must match /^[A-Za-z0-9._-]+$/ and not be '.' or '..' (got ${JSON.stringify(value)}).`,
      { label, value },
    );
  }
  return value;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function uuidv4(): string {
  return randomUUID();
}

export function deriveDurationMs(startedAt: string, endedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new AuditLayerSchemaError(
      ERROR_CODES.SCHEMA_INVALID_TIMESTAMP,
      `deriveDurationMs: invalid ISO datetime (${startedAt} / ${endedAt})`,
      { startedAt, endedAt },
    );
  }
  return Math.max(0, end - start);
}

/**
 * SHA-256 fingerprint of an arbitrary JSON-compatible value, computed over
 * the JCS canonical form so it is stable across services and SDK versions.
 */
export function fingerprint(value: unknown): string {
  const canonical = canonicalize(value ?? null);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export { SAFE_PATH_SEGMENT };
