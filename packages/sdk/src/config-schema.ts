/**
 * Public Zod schema for `AuditLoggerConfig`'s data-bearing subset.
 *
 * The SDK's runtime API consumes plain TypeScript objects so callers can
 * mount things like signing closures and pre-constructed S3 clients (which are
 * not JSON-serializable). The schema in this file is intentionally restricted
 * to the data-only subset that *can* round-trip through a JSON config file —
 * `systemId` + `storage` + optional `retention`/`hashChain`/`piiRedaction`.
 *
 * Consumers (CLI in particular) parse JSON config files through this schema so
 * they get the same validation as the SDK without duplicating shape logic.
 */
import { z } from 'zod';

import { ALL_PII_PATTERN_NAMES } from './pii-patterns.js';

const safeIdentifier = z.string().min(1);

export const LocalStorageConfigSchema = z
  .object({
    type: z.literal('local'),
    dir: safeIdentifier,
    rotateBy: z.enum(['hour', 'day']).optional(),
  })
  .strict();

export const S3StorageConfigSchema = z
  .object({
    type: z.literal('s3'),
    bucket: safeIdentifier,
    region: safeIdentifier,
    prefix: z.string().optional(),
    workMode: z.boolean().optional(),
    endpoint: z.string().url().optional(),
  })
  .strict();

export const StorageConfigSchema = z.discriminatedUnion('type', [
  LocalStorageConfigSchema,
  S3StorageConfigSchema,
]);

export const RetentionConfigSchema = z
  .object({
    minimumDays: z.number().int().nonnegative(),
    targetDays: z.number().int().nonnegative(),
  })
  .strict();

export const HashChainConfigSchema = z
  .object({
    enabled: z.boolean(),
    algorithm: z.literal('sha256'),
  })
  .strict();

const piiPatternEnum = z.enum(ALL_PII_PATTERN_NAMES as unknown as [string, ...string[]]);

export const PiiTokenStoreConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('memory') }).strict(),
  z.object({ type: z.literal('sqlite'), path: z.string().min(1) }).strict(),
]);

export const PiiRedactionConfigSchema = z
  .object({
    enabled: z.boolean(),
    strategy: z.enum(['pseudonymize', 'hash', 'remove']),
    patterns: z.record(piiPatternEnum, z.boolean()).optional(),
    customPatterns: z.record(z.string(), z.instanceof(RegExp)).optional(),
    tokenStore: PiiTokenStoreConfigSchema.optional(),
  })
  .strict();

/**
 * Data-only subset of `AuditLoggerConfig`. The full config also carries a
 * signing key, which can be either an inline secret (serializable) or a KMS
 * closure (not serializable). For JSON config files, signing is typically
 * supplied separately (env var, KMS lookup, etc.).
 */
export const FileBackedAuditConfigSchema = z
  .object({
    systemId: safeIdentifier,
    storage: StorageConfigSchema,
    retention: RetentionConfigSchema.optional(),
    hashChain: HashChainConfigSchema.optional(),
    piiRedaction: PiiRedactionConfigSchema.optional(),
  })
  .strict();

export type FileBackedAuditConfig = z.infer<typeof FileBackedAuditConfigSchema>;
