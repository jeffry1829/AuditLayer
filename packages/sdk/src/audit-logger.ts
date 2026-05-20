import {
  AuditLogEntryInputSchema,
  SCHEMA_VERSION,
  computeEntryHash,
  linkEntry,
  type AuditLogEntry,
  type AuditLogEntryInput,
} from '@auditlayer/schema';

import { LocalStorageBackend } from './backends/local.js';
import { S3StorageBackend } from './backends/s3.js';
import type { StorageBackend } from './backends/types.js';
import type { AuditLoggerConfig, EndCallInput, StartCallInput, WrapContext } from './config.js';
import { AuditLayerConfigError, AuditLayerSchemaError, ERROR_CODES } from './errors.js';
import { InMemoryPiiTokenStore, PiiRedactor, SqlitePiiTokenStore } from './pii.js';
import type { PiiTokenStore } from './pii.js';
import { wrapClient } from './providers/registry.js';
import { createSigner, type Signer } from './signing.js';
import { assertSafePathSegment, deriveDurationMs, fingerprint, nowIso, uuidv4 } from './util.js';
import { RECORDED_BY } from './version.js';

interface PendingCall {
  callId: string;
  startedAt: string;
  caseId: string;
  sessionId?: string;
  parentCallId?: string;
  modelProvider: StartCallInput['modelProvider'];
  modelName: string;
  modelVersion: string;
  modelConfiguration: Record<string, unknown>;
  promptTemplateId: string;
  promptTemplateVersion: string;
  operatorId: string;
  promptFingerprint: string;
  inputFingerprint: string;
  inputPiiRedacted?: { fields: string[]; pseudonymKey?: string };
  referenceDatabase?: string;
}

export class AuditLogger {
  readonly systemId: string;
  readonly backend: StorageBackend;
  readonly signer: Signer;
  readonly piiRedactor: PiiRedactor;
  private readonly piiTokenStore: PiiTokenStore | null;
  private readonly pending = new Map<string, PendingCall>();
  private lastEntry: AuditLogEntry | null = null;
  private chainLock: Promise<void> = Promise.resolve();

  constructor(config: AuditLoggerConfig) {
    if (!config.systemId || !config.systemId.trim()) {
      throw new AuditLayerConfigError(
        ERROR_CODES.CONFIG_MISSING_FIELD,
        'AuditLogger: systemId is required',
        { field: 'systemId' },
      );
    }
    assertSafePathSegment(config.systemId, 'systemId');
    this.systemId = config.systemId;
    this.backend = createBackend(config);
    this.signer = createSigner(config.signingKey);
    this.piiTokenStore = createPiiTokenStore(config);
    this.piiRedactor = new PiiRedactor(config.piiRedaction, this.piiTokenStore);
  }

  async startCall(input: StartCallInput): Promise<string> {
    if (!input.caseId || !input.caseId.trim()) {
      throw new AuditLayerConfigError(
        ERROR_CODES.CONFIG_MISSING_FIELD,
        'startCall: caseId is required',
        { field: 'caseId' },
      );
    }
    const callId = uuidv4();
    const startedAt = nowIso();
    const inputForLog = await this.redactInputForLog(input.input, input.caseId);
    const promptForFingerprint = input.prompt ?? input.input;
    const pending: PendingCall = {
      callId,
      startedAt,
      caseId: input.caseId,
      sessionId: input.sessionId,
      parentCallId: input.parentCallId,
      modelProvider: input.modelProvider,
      modelName: input.modelName,
      modelVersion: input.modelVersion,
      modelConfiguration: input.modelConfiguration ?? {},
      promptTemplateId: input.promptTemplateId,
      promptTemplateVersion: input.promptTemplateVersion,
      operatorId: input.operatorId,
      promptFingerprint: fingerprint(promptForFingerprint),
      inputFingerprint: fingerprint(inputForLog.redacted),
      inputPiiRedacted:
        inputForLog.fieldsTouched.length > 0
          ? {
              fields: inputForLog.fieldsTouched,
              pseudonymKey: inputForLog.pseudonymKey,
            }
          : undefined,
      referenceDatabase: input.referenceDatabase,
    };
    this.pending.set(callId, pending);
    return callId;
  }

  async endCall(callId: string, end: EndCallInput): Promise<AuditLogEntry> {
    const pending = this.pending.get(callId);
    if (!pending) {
      throw new AuditLayerConfigError(
        ERROR_CODES.LOGGER_CALL_NOT_PENDING,
        `endCall: callId ${callId} is not in the pending set (already finalised or never started).`,
        { callId },
      );
    }
    this.pending.delete(callId);
    const endedAt = nowIso();

    const outputFingerprint = fingerprint(end.output ?? end.outputDecision ?? null);

    const inputForEntry: AuditLogEntryInput = {
      schemaVersion: SCHEMA_VERSION,
      recordedBy: RECORDED_BY,
      callId: pending.callId,
      parentCallId: pending.parentCallId,
      caseId: pending.caseId,
      sessionId: pending.sessionId,
      systemId: this.systemId,
      startedAt: pending.startedAt,
      endedAt,
      durationMs: deriveDurationMs(pending.startedAt, endedAt),
      modelProvider: pending.modelProvider,
      modelName: pending.modelName,
      modelVersion: pending.modelVersion,
      modelConfiguration: pending.modelConfiguration,
      promptTemplateId: pending.promptTemplateId,
      promptTemplateVersion: pending.promptTemplateVersion,
      promptFingerprint: pending.promptFingerprint,
      inputFingerprint: pending.inputFingerprint,
      inputPiiRedacted: pending.inputPiiRedacted,
      referenceDatabase: pending.referenceDatabase,
      outputFingerprint,
      outputDecision: end.outputDecision ?? end.output ?? null,
      reasonCodes: end.reasonCodes,
      operatorId: pending.operatorId,
      humanReview: end.humanReview,
      riskFlags: end.riskFlags,
      incidentId: end.incidentId,
    };

    return await this.persist(inputForEntry);
  }

  /**
   * Wrap a third-party SDK client. Provider is detected via the provider
   * registry — see `packages/sdk/src/providers/`. Throws
   * `AuditLayerProviderError` if no registered adapter recognises the client.
   */
  wrap<T extends object>(client: T, context: WrapContext): T {
    return wrapClient(this, client, context);
  }

  /** Serialize append + chain link under a lock so the chain stays linear. */
  private async persist(input: AuditLogEntryInput): Promise<AuditLogEntry> {
    const parsed = AuditLogEntryInputSchema.parse(input);
    const release = await this.acquireChainLock();
    try {
      const linked = linkEntry(parsed, this.lastEntry);
      const signature = await this.signer.sign(linked.entryHash);
      const entry: AuditLogEntry = { ...linked, signature };
      // Defense in depth: recompute the entry hash from the hashed payload
      // (everything except entryHash + signature) before persisting.
      const { entryHash: _eh, signature: _sig, ...hashed } = entry;
      void _eh;
      void _sig;
      const recheck = computeEntryHash(hashed);
      if (recheck !== entry.entryHash) {
        throw new AuditLayerSchemaError(
          ERROR_CODES.SCHEMA_HASH_RECHECK_FAILED,
          'AuditLogger: entry hash recheck failed before persistence',
          { callId: entry.callId, expected: entry.entryHash, computed: recheck },
        );
      }
      await this.backend.append(entry, { systemId: this.systemId });
      this.lastEntry = entry;
      return entry;
    } finally {
      release();
    }
  }

  private async acquireChainLock(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prior = this.chainLock;
    this.chainLock = prior.then(() => next);
    await prior;
    return release;
  }

  private async redactInputForLog(value: unknown, caseId: string) {
    return await this.piiRedactor.redact(value, caseId);
  }

  /** Close storage and pii resources. */
  async close(): Promise<void> {
    await this.backend.close?.();
    if (this.piiTokenStore && 'close' in this.piiTokenStore) {
      await (this.piiTokenStore as { close?: () => Promise<void> | void }).close?.();
    }
  }
}

function createBackend(config: AuditLoggerConfig): StorageBackend {
  switch (config.storage.type) {
    case 'local':
      return new LocalStorageBackend(config.storage);
    case 's3':
      return new S3StorageBackend(config.storage);
    default: {
      const _exhaustive: never = config.storage;
      void _exhaustive;
      throw new AuditLayerConfigError(
        ERROR_CODES.CONFIG_UNKNOWN_BACKEND,
        'AuditLogger: unknown storage backend',
        { received: config.storage },
      );
    }
  }
}

function createPiiTokenStore(config: AuditLoggerConfig): PiiTokenStore | null {
  const pr = config.piiRedaction;
  if (!pr?.enabled || pr.strategy !== 'pseudonymize') return null;
  const store = pr.tokenStore ?? { type: 'memory' as const };
  switch (store.type) {
    case 'memory':
      return new InMemoryPiiTokenStore();
    case 'sqlite':
      return new SqlitePiiTokenStore(store.path);
    default: {
      const _exhaustive: never = store;
      void _exhaustive;
      throw new AuditLayerConfigError(
        ERROR_CODES.CONFIG_UNKNOWN_STORE,
        'AuditLogger: unknown pii token store type',
        { received: store },
      );
    }
  }
}
