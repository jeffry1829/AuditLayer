import type { ModelProvider } from '@auditlayer/schema';

import type { PiiPatternName } from './pii-patterns.js';

export type { PiiPatternName } from './pii-patterns.js';

export interface LocalStorageConfig {
  type: 'local';
  /** Directory under which JSONL files are written. */
  dir: string;
  /** File rotation granularity. Defaults to `hour`. */
  rotateBy?: 'hour' | 'day';
}

export interface S3StorageConfig {
  type: 's3';
  bucket: string;
  /** AWS region (e.g., 'eu-west-1'). */
  region: string;
  /** Optional key prefix inside the bucket. */
  prefix?: string;
  /**
   * Indicates the caller has configured S3 Object Lock + retention on the
   * bucket. The SDK does not enforce this; it only records the intent.
   */
  workMode?: boolean;
  /** Optional explicit endpoint for S3-compatible services. */
  endpoint?: string;
}

export type StorageConfig = LocalStorageConfig | S3StorageConfig;

export interface RetentionConfig {
  /** Article 26(6) minimum for deployers. */
  minimumDays: number;
  /** Provider QMS target retention. */
  targetDays: number;
}

export interface HashChainConfig {
  enabled: boolean;
  algorithm: 'sha256';
}

export interface InlineSigningKeyConfig {
  kind: 'inline';
  /** HMAC secret. Phase 1 default. NOT recommended for production. */
  secret: string;
}

export interface KmsSigningKeyConfig {
  kind: 'kms';
  /** Opaque identifier for the KMS key (the SDK does not call AWS directly in Phase 1). */
  keyId: string;
  /** A function the integrator supplies that signs a SHA-256 hex digest. */
  sign: (entryHashHex: string) => Promise<string> | string;
}

export type SigningKeyConfig = InlineSigningKeyConfig | KmsSigningKeyConfig;

export interface PiiSqliteStoreConfig {
  type: 'sqlite';
  path: string;
}

export interface PiiInMemoryStoreConfig {
  type: 'memory';
}

export type PiiTokenStoreConfig = PiiSqliteStoreConfig | PiiInMemoryStoreConfig;

export interface PiiRedactionConfig {
  enabled: boolean;
  /** 'pseudonymize' replaces with reversible token; 'hash' replaces with SHA-256; 'remove' deletes. */
  strategy: 'pseudonymize' | 'hash' | 'remove';
  /** Which built-in patterns to enable. */
  patterns?: Partial<Record<PiiPatternName, boolean>>;
  /** Custom regex patterns keyed by name; matches are redacted. */
  customPatterns?: Record<string, RegExp>;
  /** Token store backing the pseudonymize strategy. */
  tokenStore?: PiiTokenStoreConfig;
}

export interface AuditLoggerConfig {
  systemId: string;
  storage: StorageConfig;
  retention?: RetentionConfig;
  hashChain?: HashChainConfig;
  signingKey: SigningKeyConfig;
  piiRedaction?: PiiRedactionConfig;
}

export interface WrapContext {
  caseId: string;
  promptTemplateId: string;
  promptTemplateVersion: string;
  operatorId: string;
  sessionId?: string;
  parentCallId?: string;
}

export interface StartCallInput {
  caseId: string;
  sessionId?: string;
  parentCallId?: string;
  modelProvider: ModelProvider;
  modelName: string;
  modelVersion: string;
  modelConfiguration?: Record<string, unknown>;
  promptTemplateId: string;
  promptTemplateVersion: string;
  operatorId: string;
  /** Raw input data (used for inputFingerprint and PII redaction). */
  input?: unknown;
  /**
   * The fully-assembled prompt that will be sent to the model
   * (template + variables resolved). If omitted, `input` is used for
   * promptFingerprint as a fallback.
   */
  prompt?: unknown;
  referenceDatabase?: string;
}

export interface EndCallInput {
  output?: unknown;
  outputDecision?: unknown;
  reasonCodes?: string[];
  riskFlags?: string[];
  humanReview?: {
    reviewerId: string;
    reviewedAt: string;
    decision: 'approve' | 'override' | 'escalate';
    rationale?: string;
    finalDecision?: unknown;
  };
  incidentId?: string;
}
