export { AuditLogger } from './audit-logger.js';
export { SDK_NAME, SDK_VERSION } from './version.js';

export type {
  AuditLoggerConfig,
  StorageConfig,
  LocalStorageConfig,
  S3StorageConfig,
  RetentionConfig,
  HashChainConfig,
  SigningKeyConfig,
  InlineSigningKeyConfig,
  KmsSigningKeyConfig,
  PiiPatternName,
  PiiRedactionConfig,
  PiiTokenStoreConfig,
  WrapContext,
  StartCallInput,
  EndCallInput,
} from './config.js';

export type { StorageBackend } from './backends/types.js';
export { LocalStorageBackend } from './backends/local.js';
export { S3StorageBackend } from './backends/s3.js';

export type { PiiTokenStore } from './pii.js';
export {
  DEFAULT_PII_PATTERNS,
  DEFAULT_ENABLED_PII_PATTERNS,
  PII_PATTERN_REGISTRY,
  ALL_PII_PATTERN_NAMES,
  detectPii,
  hashString,
  InMemoryPiiTokenStore,
  PiiRedactor,
  SqlitePiiTokenStore,
} from './pii.js';
export type { PiiPatternDefinition } from './pii-patterns.js';

export type { Signer } from './signing.js';
export { createSigner, InlineSigner } from './signing.js';

export { fingerprint, deriveDurationMs, nowIso, uuidv4 } from './util.js';

export {
  AuditLayerError,
  AuditLayerConfigError,
  AuditLayerStorageError,
  AuditLayerSchemaError,
  AuditLayerSignerError,
  AuditLayerProviderError,
  AuditLayerPiiError,
  ERROR_CODES,
  type AuditLayerErrorCode,
} from './errors.js';

export {
  STORAGE_DEFAULTS,
  SIGNING_DEFAULTS,
  PII_DEFAULTS,
  CLI_DEFAULTS,
  RETENTION_DEFAULTS,
  HASH_CHAIN_DEFAULTS,
} from './defaults.js';

export {
  FileBackedAuditConfigSchema,
  LocalStorageConfigSchema,
  S3StorageConfigSchema,
  StorageConfigSchema,
  RetentionConfigSchema,
  HashChainConfigSchema,
  PiiRedactionConfigSchema,
  PiiTokenStoreConfigSchema,
  type FileBackedAuditConfig,
} from './config-schema.js';

export type { ProviderAdapter, ProviderHostLogger } from './providers/types.js';
export { PROVIDER_ERROR_RISK_FLAG } from './providers/types.js';
export {
  anthropicAdapter,
  openaiAdapter,
  BUILT_IN_PROVIDER_ADAPTERS,
  detectAdapter,
  registerProvider,
  resolveAdapters,
  unregisterProvider,
  wrapClient,
} from './providers/index.js';
