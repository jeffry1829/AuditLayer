/**
 * Centralized defaults for the AuditLayer SDK.
 *
 * Every configurable knob whose default would otherwise be a magic literal
 * scattered through business code lives here. Two rules:
 *
 *   1. Business code imports from here; never inline literals.
 *   2. Public types stay configurable: a caller can override any default by
 *      passing an explicit value in `AuditLoggerConfig` or related option
 *      bags. Tests pin behavior by passing overrides, not by editing this
 *      file.
 */

/** Storage layout / rotation. */
export const STORAGE_DEFAULTS = {
  /** File rotation granularity for the local backend. */
  rotateBy: 'hour' as const,
  /** Checksum algorithm requested on every S3 PutObject. */
  s3ChecksumAlgorithm: 'SHA256' as const,
  /** Content-Type written to every S3 object. */
  s3ContentType: 'application/json' as const,
  /** Extension applied to JSONL files. */
  jsonlExtension: '.jsonl' as const,
} as const;

/** Signing / cryptographic constraints. */
export const SIGNING_DEFAULTS = {
  /** Minimum length of the inline HMAC secret. */
  inlineSecretMinLength: 16,
  /** Hex prefix used in inline HMAC signatures. */
  inlineSignaturePrefix: 'hmac-sha256' as const,
  /** Keyed identifier reported by InlineSigner.keyId. */
  inlineKeyId: 'inline' as const,
} as const;

/** PII redaction defaults. */
export const PII_DEFAULTS = {
  /** Default redaction strategy when caller enables redaction but omits strategy. */
  strategy: 'pseudonymize' as const,
  /** Hex byte count requested from randomBytes() when minting a pseudonym. */
  pseudonymRandomBytes: 8,
  /** Stable prefix used on minted pseudonyms. */
  pseudonymPrefix: 'pii' as const,
  /** Stable prefix used on hash-strategy redactions. */
  hashPrefix: 'pii-h' as const,
  /** Number of hex characters of the SHA-256 hash kept in hash-strategy redactions. */
  hashHexLength: 16,
  /** Replacement string for remove-strategy redactions. */
  removePlaceholder: '[REDACTED]' as const,
  /** ASCII Unit Separator (U+001F) used as internal composite-key delimiter. */
  compositeDelimiter: '\x1f' as const,
} as const;

/** CLI defaults. */
export const CLI_DEFAULTS = {
  /** Files searched in CWD when --config is not passed. Order = preference. */
  configFiles: ['auditlayer.config.json', '.auditlayer.json'] as const,
  /** Default output path for `init`. */
  initOutputPath: 'auditlayer.config.json' as const,
  /** Default config body written by `init`. Caller substitutes real values. */
  initConfigTemplate: {
    systemId: 'your-system-id',
    storage: { type: 'local' as const, dir: './audit-logs' },
  } as const,
} as const;

/** Article 12 / 26(6) retention floors. */
export const RETENTION_DEFAULTS = {
  /** Article 26(6) minimum for deployers (days). */
  deployerMinimumDays: 180,
  /** Provider QMS target retention (days). */
  providerTargetDays: 2555,
} as const;

/** Hash chain defaults. */
export const HASH_CHAIN_DEFAULTS = {
  enabled: true,
  algorithm: 'sha256' as const,
} as const;
