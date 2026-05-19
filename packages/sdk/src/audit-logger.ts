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
import { InMemoryPiiTokenStore, PiiRedactor, SqlitePiiTokenStore } from './pii.js';
import type { PiiTokenStore } from './pii.js';
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
      throw new Error('AuditLogger: systemId is required');
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
      throw new Error('startCall: caseId is required');
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
      throw new Error(
        `endCall: callId ${callId} is not in the pending set (already finalised or never started).`,
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
   * Wrap a third-party SDK client (Anthropic or OpenAI). The wrapped client
   * exposes the same surface; calls to known generation methods are
   * intercepted and logged with the context supplied to `wrap`.
   */
  wrap<T extends object>(client: T, context: WrapContext): T {
    const provider = detectProvider(client);
    if (provider === 'anthropic') {
      return wrapAnthropic(this, client, context) as T;
    }
    if (provider === 'openai') {
      return wrapOpenAi(this, client, context) as T;
    }
    throw new Error(
      'AuditLogger.wrap: client is neither an Anthropic nor OpenAI SDK instance. ' +
        'Use startCall/endCall for unsupported clients.',
    );
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
        throw new Error('AuditLogger: entry hash recheck failed before persistence');
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
      throw new Error('AuditLogger: unknown storage backend');
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
      throw new Error('AuditLogger: unknown pii token store type');
    }
  }
}

function detectProvider(client: object): 'anthropic' | 'openai' | null {
  const c = client as Record<string, unknown>;
  // OpenAI v4 and Anthropic SDKs are nearly disjoint shapes; we look for the
  // specific method we are about to wrap.
  const openaiCreate =
    typeof (
      (c['chat'] as Record<string, unknown> | undefined)?.['completions'] as
        | Record<string, unknown>
        | undefined
    )?.['create'] === 'function';
  if (openaiCreate) return 'openai';

  const anthropicCreate =
    typeof (c['messages'] as Record<string, unknown> | undefined)?.['create'] === 'function';
  if (anthropicCreate) return 'anthropic';

  return null;
}

function wrapAnthropic<T extends object>(audit: AuditLogger, client: T, context: WrapContext): T {
  type CreateFn = (...args: unknown[]) => Promise<unknown>;
  const messages = (client as unknown as { messages: { create: CreateFn } }).messages;
  const originalCreate = messages.create.bind(messages);
  messages.create = async (...args: unknown[]) => {
    const params = (args[0] as Record<string, unknown>) ?? {};
    const callId = await audit.startCall({
      caseId: context.caseId,
      sessionId: context.sessionId,
      parentCallId: context.parentCallId,
      modelProvider: 'anthropic',
      modelName: String(params['model'] ?? 'unknown'),
      modelVersion: deriveAnthropicModelVersion(String(params['model'] ?? '')),
      modelConfiguration: extractAnthropicConfig(params),
      promptTemplateId: context.promptTemplateId,
      promptTemplateVersion: context.promptTemplateVersion,
      operatorId: context.operatorId,
      input: { messages: params['messages'], system: params['system'] },
    });
    try {
      const response = await originalCreate(...args);
      await audit.endCall(callId, {
        output: extractAnthropicOutput(response),
        outputDecision: extractAnthropicOutput(response),
      });
      return response;
    } catch (err) {
      await audit.endCall(callId, {
        output: null,
        outputDecision: null,
        riskFlags: ['provider_error'],
      });
      throw err;
    }
  };
  return client;
}

function wrapOpenAi<T extends object>(audit: AuditLogger, client: T, context: WrapContext): T {
  type CreateFn = (...args: unknown[]) => Promise<unknown>;
  const completions = (client as unknown as { chat: { completions: { create: CreateFn } } }).chat
    .completions;
  const originalCreate = completions.create.bind(completions);
  completions.create = async (...args: unknown[]) => {
    const params = (args[0] as Record<string, unknown>) ?? {};
    const callId = await audit.startCall({
      caseId: context.caseId,
      sessionId: context.sessionId,
      parentCallId: context.parentCallId,
      modelProvider: 'openai',
      modelName: String(params['model'] ?? 'unknown'),
      modelVersion: String(params['model'] ?? ''),
      modelConfiguration: extractOpenAiConfig(params),
      promptTemplateId: context.promptTemplateId,
      promptTemplateVersion: context.promptTemplateVersion,
      operatorId: context.operatorId,
      input: { messages: params['messages'] },
    });
    try {
      const response = await originalCreate(...args);
      await audit.endCall(callId, {
        output: extractOpenAiOutput(response),
        outputDecision: extractOpenAiOutput(response),
      });
      return response;
    } catch (err) {
      await audit.endCall(callId, {
        output: null,
        outputDecision: null,
        riskFlags: ['provider_error'],
      });
      throw err;
    }
  };
  return client;
}

function deriveAnthropicModelVersion(model: string): string {
  // Anthropic snapshots are typically encoded in the model string itself
  // (e.g., claude-3-5-sonnet-20241022 — the trailing date).
  const m = /-(\d{8})$/.exec(model);
  return m ? m[1]! : model || 'unknown';
}

function extractAnthropicConfig(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ['temperature', 'top_p', 'top_k', 'max_tokens', 'stop_sequences']) {
    if (key in params) out[key] = params[key];
  }
  return out;
}

function extractOpenAiConfig(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of [
    'temperature',
    'top_p',
    'max_tokens',
    'frequency_penalty',
    'presence_penalty',
  ]) {
    if (key in params) out[key] = params[key];
  }
  return out;
}

function extractAnthropicOutput(response: unknown): unknown {
  if (response && typeof response === 'object') {
    const r = response as Record<string, unknown>;
    const usage = r['usage'];
    const content = r['content'];
    return { content, usage, model: r['model'], id: r['id'] };
  }
  return response ?? null;
}

function extractOpenAiOutput(response: unknown): unknown {
  if (response && typeof response === 'object') {
    const r = response as Record<string, unknown>;
    return {
      choices: r['choices'],
      usage: r['usage'],
      model: r['model'],
      id: r['id'],
    };
  }
  return response ?? null;
}
