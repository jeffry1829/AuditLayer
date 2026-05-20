/**
 * AuditLayer typed error hierarchy.
 *
 * Every public failure path throws one of these. Tests and callers should
 * branch on `instanceof` or `error.code`, never on `error.message` text.
 *
 * Adding a new error class: subclass `AuditLayerError`, assign a stable
 * `code`, and register it in `ERROR_CODES`.
 */

export const ERROR_CODES = {
  // Configuration
  CONFIG_INVALID: 'AUDITLAYER_CONFIG_INVALID',
  CONFIG_MISSING_FIELD: 'AUDITLAYER_CONFIG_MISSING_FIELD',
  CONFIG_UNKNOWN_BACKEND: 'AUDITLAYER_CONFIG_UNKNOWN_BACKEND',
  CONFIG_UNKNOWN_STORE: 'AUDITLAYER_CONFIG_UNKNOWN_STORE',

  // Storage
  STORAGE_BAD_JSON: 'AUDITLAYER_STORAGE_BAD_JSON',
  STORAGE_BAD_SCHEMA: 'AUDITLAYER_STORAGE_BAD_SCHEMA',
  STORAGE_BACKEND_MISSING_DEP: 'AUDITLAYER_STORAGE_BACKEND_MISSING_DEP',

  // Schema / hashing
  SCHEMA_HASH_RECHECK_FAILED: 'AUDITLAYER_SCHEMA_HASH_RECHECK_FAILED',
  SCHEMA_INVALID_TIMESTAMP: 'AUDITLAYER_SCHEMA_INVALID_TIMESTAMP',

  // Signing
  SIGNER_INVALID_SECRET: 'AUDITLAYER_SIGNER_INVALID_SECRET',
  SIGNER_EXTERNAL_INVALID_OUTPUT: 'AUDITLAYER_SIGNER_EXTERNAL_INVALID_OUTPUT',

  // Provider
  PROVIDER_UNSUPPORTED_CLIENT: 'AUDITLAYER_PROVIDER_UNSUPPORTED_CLIENT',

  // PII
  PII_TOKEN_STORE_MISSING: 'AUDITLAYER_PII_TOKEN_STORE_MISSING',
  PII_TOKEN_STORE_MISSING_DEP: 'AUDITLAYER_PII_TOKEN_STORE_MISSING_DEP',

  // Logger lifecycle
  LOGGER_CALL_NOT_PENDING: 'AUDITLAYER_LOGGER_CALL_NOT_PENDING',
  LOGGER_PATH_SEGMENT_UNSAFE: 'AUDITLAYER_LOGGER_PATH_SEGMENT_UNSAFE',
} as const;

export type AuditLayerErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export class AuditLayerError extends Error {
  readonly code: AuditLayerErrorCode;
  readonly context: Readonly<Record<string, unknown>>;

  constructor(code: AuditLayerErrorCode, message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.context = Object.freeze({ ...context });
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuditLayerConfigError extends AuditLayerError {}
export class AuditLayerStorageError extends AuditLayerError {}
export class AuditLayerSchemaError extends AuditLayerError {}
export class AuditLayerSignerError extends AuditLayerError {}
export class AuditLayerProviderError extends AuditLayerError {}
export class AuditLayerPiiError extends AuditLayerError {}
/** Logger lifecycle / state-machine violations (e.g. endCall on a finalized callId). */
export class AuditLayerLifecycleError extends AuditLayerError {}
