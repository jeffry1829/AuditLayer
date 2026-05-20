import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { verifyChain } from '@auditlayer/schema';

import { AuditLogger } from '../src/audit-logger.js';
import { LocalStorageBackend } from '../src/backends/local.js';
import { AuditLayerProviderError, ERROR_CODES } from '../src/errors.js';

const TEST_SECRET = 'test-secret-key-with-enough-length-1234567890';

function makeLogger(dir: string) {
  return new AuditLogger({
    systemId: 'sys-test',
    storage: { type: 'local', dir },
    signingKey: { kind: 'inline', secret: TEST_SECRET },
    hashChain: { enabled: true, algorithm: 'sha256' },
    piiRedaction: { enabled: false, strategy: 'pseudonymize' },
  });
}

async function collectAll(backend: LocalStorageBackend, systemId: string) {
  const out = [];
  for await (const entry of backend.list({ systemId })) {
    out.push(entry);
  }
  return out;
}

describe('AuditLogger', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'auditlayer-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('records a single call via startCall/endCall and persists to local backend', async () => {
    const audit = makeLogger(dir);
    const callId = await audit.startCall({
      caseId: 'case-1',
      modelProvider: 'anthropic',
      modelName: 'claude-3-5-sonnet',
      modelVersion: '20241022',
      promptTemplateId: 'tpl-1',
      promptTemplateVersion: '1.0.0',
      operatorId: 'op-1',
      input: { messages: [{ role: 'user', content: 'hi' }] },
    });
    const entry = await audit.endCall(callId, {
      output: { content: 'hello' },
      outputDecision: { ok: true },
      reasonCodes: ['OK'],
    });
    expect(entry.callId).toBe(callId);
    expect(entry.entryHash).toMatch(/^[0-9a-f]{64}$/);
    expect(entry.signature).toMatch(/^hmac-sha256:inline:[0-9a-f]{64}$/);
    expect(entry.systemId).toBe('sys-test');
    expect(entry.outputDecision).toEqual({ ok: true });

    const all = await collectAll(audit.backend as LocalStorageBackend, 'sys-test');
    expect(all).toHaveLength(1);
    expect(all[0]!.entryHash).toBe(entry.entryHash);
    await audit.close();
  });

  it('chains multiple entries and verifyChain accepts the result', async () => {
    const audit = makeLogger(dir);
    const entries = [];
    for (let i = 0; i < 5; i++) {
      const callId = await audit.startCall({
        caseId: `case-${i}`,
        modelProvider: 'openai',
        modelName: 'gpt-4o',
        modelVersion: '2024-08-06',
        promptTemplateId: 'tpl',
        promptTemplateVersion: '1.0.0',
        operatorId: 'op',
        input: { i },
      });
      entries.push(await audit.endCall(callId, { output: { out: i } }));
    }
    expect(verifyChain(entries).valid).toBe(true);
    // Each entry's previousEntryHash must match the prior entryHash.
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i]!.previousEntryHash).toBe(entries[i - 1]!.entryHash);
    }
    await audit.close();
  });

  it('rejects endCall for unknown callId', async () => {
    const audit = makeLogger(dir);
    await expect(audit.endCall('unknown', {})).rejects.toThrow(/pending set/);
    await audit.close();
  });

  it('rejects systemId with path-traversal characters', () => {
    expect(
      () =>
        new AuditLogger({
          systemId: '../escape',
          storage: { type: 'local', dir },
          signingKey: { kind: 'inline', secret: TEST_SECRET },
        }),
    ).toThrow(/systemId/);
  });

  it('rejects startCall with empty caseId', async () => {
    const audit = makeLogger(dir);
    await expect(
      audit.startCall({
        caseId: '',
        modelProvider: 'anthropic',
        modelName: 'm',
        modelVersion: 'v',
        promptTemplateId: 't',
        promptTemplateVersion: '1.0',
        operatorId: 'op',
      }),
    ).rejects.toThrow(/caseId/);
    await audit.close();
  });

  it('requires systemId', () => {
    expect(
      () =>
        new AuditLogger({
          systemId: '',
          storage: { type: 'local', dir },
          signingKey: { kind: 'inline', secret: TEST_SECRET },
        }),
    ).toThrow(/systemId/);
  });

  it('refuses inline signers with very short secrets', () => {
    expect(
      () =>
        new AuditLogger({
          systemId: 'sys-test',
          storage: { type: 'local', dir },
          signingKey: { kind: 'inline', secret: 'short' },
        }),
    ).toThrow(/InlineSigner/);
  });

  it('redacts PII into pseudonyms when configured', async () => {
    const audit = new AuditLogger({
      systemId: 'sys-pii',
      storage: { type: 'local', dir },
      signingKey: { kind: 'inline', secret: TEST_SECRET },
      piiRedaction: {
        enabled: true,
        strategy: 'pseudonymize',
        patterns: { email: true, phone: true },
        tokenStore: { type: 'memory' },
      },
    });
    const callId = await audit.startCall({
      caseId: 'case-pii',
      modelProvider: 'openai',
      modelName: 'gpt-4o',
      modelVersion: '2024-08-06',
      promptTemplateId: 'tpl',
      promptTemplateVersion: '1.0.0',
      operatorId: 'op',
      input: { resume: 'Contact alice@example.com or +1 555 123 4567' },
    });
    const entry = await audit.endCall(callId, { output: {}, outputDecision: { ok: true } });
    expect(entry.inputPiiRedacted).toBeDefined();
    expect(entry.inputPiiRedacted!.fields.length).toBeGreaterThan(0);
    expect(entry.inputPiiRedacted!.pseudonymKey).toBe('case-pii');
    await audit.close();
  });

  it('wrap() rejects unsupported clients', () => {
    const audit = makeLogger(dir);
    try {
      audit.wrap({} as object, {
        caseId: 'c',
        promptTemplateId: 'p',
        promptTemplateVersion: '1.0',
        operatorId: 'o',
      });
      throw new Error('expected wrap() to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AuditLayerProviderError);
      expect((err as AuditLayerProviderError).code).toBe(ERROR_CODES.PROVIDER_UNSUPPORTED_CLIENT);
    }
  });

  it('wrap() intercepts Anthropic messages.create()', async () => {
    const audit = makeLogger(dir);
    const mockAnthropic = {
      messages: {
        create: async (params: Record<string, unknown>) => ({
          id: 'msg_xyz',
          model: params['model'],
          content: [{ type: 'text', text: 'hi' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      },
    };
    const wrapped = audit.wrap(mockAnthropic, {
      caseId: 'case-anth',
      promptTemplateId: 'tpl-a',
      promptTemplateVersion: '1.0',
      operatorId: 'op',
    });
    const resp = await wrapped.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.2,
      max_tokens: 64,
    });
    expect((resp as { id: string }).id).toBe('msg_xyz');
    const all = await collectAll(audit.backend as LocalStorageBackend, 'sys-test');
    expect(all).toHaveLength(1);
    expect(all[0]!.modelProvider).toBe('anthropic');
    expect(all[0]!.modelVersion).toBe('20241022');
    expect((all[0]!.modelConfiguration as Record<string, unknown>)['temperature']).toBe(0.2);
    await audit.close();
  });

  it('wrap() intercepts OpenAI chat.completions.create()', async () => {
    const audit = makeLogger(dir);
    const mockOpenAi = {
      chat: {
        completions: {
          create: async (params: Record<string, unknown>) => ({
            id: 'cmpl_xyz',
            model: params['model'],
            choices: [
              { index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 1 },
          }),
        },
      },
    };
    const wrapped = audit.wrap(mockOpenAi, {
      caseId: 'case-oai',
      promptTemplateId: 'tpl-o',
      promptTemplateVersion: '1.0',
      operatorId: 'op',
    });
    const resp = await wrapped.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect((resp as { id: string }).id).toBe('cmpl_xyz');
    const all = await collectAll(audit.backend as LocalStorageBackend, 'sys-test');
    expect(all).toHaveLength(1);
    expect(all[0]!.modelProvider).toBe('openai');
    await audit.close();
  });

  it('wrap() logs failed Anthropic calls with provider_error risk flag', async () => {
    const audit = makeLogger(dir);
    const mockAnthropic = {
      messages: {
        create: async () => {
          throw new Error('boom');
        },
      },
    };
    const wrapped = audit.wrap(mockAnthropic, {
      caseId: 'case-fail',
      promptTemplateId: 'tpl',
      promptTemplateVersion: '1.0',
      operatorId: 'op',
    });
    await expect(
      wrapped.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'x' }],
      }),
    ).rejects.toThrow(/boom/);
    const all = await collectAll(audit.backend as LocalStorageBackend, 'sys-test');
    expect(all).toHaveLength(1);
    expect(all[0]!.riskFlags).toContain('provider_error');
    await audit.close();
  });
});
