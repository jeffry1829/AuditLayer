import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AuditLogger } from '../src/audit-logger.js';
import { AuditLayerProviderError, ERROR_CODES } from '../src/errors.js';
import {
  ANTHROPIC_SNAPSHOT_REGEX,
  deriveAnthropicModelVersion,
} from '../src/providers/anthropic.js';
import {
  BUILT_IN_PROVIDER_ADAPTERS,
  anthropicAdapter,
  detectAdapter,
  openaiAdapter,
  registerProvider,
  resolveAdapters,
  unregisterProvider,
} from '../src/providers/index.js';

const TEST_SECRET = 'test-secret-key-with-enough-length-1234567890';

describe('provider registry', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'al-prov-'));
  });

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function makeLogger() {
    return new AuditLogger({
      systemId: 'sys-prov',
      storage: { type: 'local', dir },
      signingKey: { kind: 'inline', secret: TEST_SECRET },
      hashChain: { enabled: true, algorithm: 'sha256' },
      piiRedaction: { enabled: false, strategy: 'pseudonymize' },
    });
  }

  it('built-in adapters include anthropic + openai', () => {
    const ids = BUILT_IN_PROVIDER_ADAPTERS.map((a) => a.providerId);
    expect(ids).toContain('anthropic');
    expect(ids).toContain('openai');
  });

  it('detectAdapter matches anthropic client shape', () => {
    const client = { messages: { create: async () => ({}) } };
    expect(detectAdapter(client)).toBe(anthropicAdapter);
  });

  it('detectAdapter matches openai client shape', () => {
    const client = { chat: { completions: { create: async () => ({}) } } };
    expect(detectAdapter(client)).toBe(openaiAdapter);
  });

  it('detectAdapter returns null for unknown client', () => {
    expect(detectAdapter({})).toBeNull();
  });

  it('wrap() throws AuditLayerProviderError for unknown client', () => {
    const audit = makeLogger();
    try {
      audit.wrap(
        {},
        {
          caseId: 'c',
          promptTemplateId: 'p',
          promptTemplateVersion: '1.0',
          operatorId: 'o',
        },
      );
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AuditLayerProviderError);
      expect((err as AuditLayerProviderError).code).toBe(ERROR_CODES.PROVIDER_UNSUPPORTED_CLIENT);
    }
  });

  it('custom adapter registration takes precedence + can be removed', async () => {
    const audit = makeLogger();
    let wrappedCalled = false;
    const fakeAdapter = {
      providerId: 'self_hosted' as const,
      detect: (c: object) => 'mySpecial' in c,
      wrap: (_a: unknown, client: { mySpecial: () => Promise<unknown> }) => {
        const orig = client.mySpecial.bind(client);
        client.mySpecial = async () => {
          wrappedCalled = true;
          return orig();
        };
        return client;
      },
    };
    registerProvider(fakeAdapter as unknown as Parameters<typeof registerProvider>[0]);
    try {
      const client = audit.wrap({ mySpecial: async () => 'ok' } as object, {
        caseId: 'c',
        promptTemplateId: 'p',
        promptTemplateVersion: '1.0',
        operatorId: 'o',
      }) as { mySpecial: () => Promise<string> };
      await client.mySpecial();
      expect(wrappedCalled).toBe(true);
    } finally {
      unregisterProvider('self_hosted');
    }
    expect(resolveAdapters().find((a) => a.providerId === 'self_hosted')).toBeUndefined();
  });
});

describe('deriveAnthropicModelVersion', () => {
  it('extracts trailing 8-digit snapshot', () => {
    expect(deriveAnthropicModelVersion('claude-3-5-sonnet-20241022')).toBe('20241022');
  });
  it('returns the full model name when no snapshot suffix', () => {
    expect(deriveAnthropicModelVersion('claude-3-opus')).toBe('claude-3-opus');
  });
  it('returns "unknown" for empty input', () => {
    expect(deriveAnthropicModelVersion('')).toBe('unknown');
  });
  it('snapshot regex requires exactly 8 digits at the tail', () => {
    expect(ANTHROPIC_SNAPSHOT_REGEX.test('-1234567')).toBe(false);
    expect(ANTHROPIC_SNAPSHOT_REGEX.test('-12345678')).toBe(true);
    expect(ANTHROPIC_SNAPSHOT_REGEX.test('-123456789')).toBe(false);
  });
});
