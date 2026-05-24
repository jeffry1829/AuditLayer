import { rmSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { VouchRailProviderError, ERROR_CODES } from '../src/errors.js';
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

import { makeLocalLogger, mkTmpAuditDir } from './_helpers.js';

describe('provider registry', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkTmpAuditDir('prov-');
  });

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function makeLogger() {
    return makeLocalLogger(dir, {
      systemId: 'sys-prov',
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

  it('wrap() throws VouchRailProviderError for unknown client', () => {
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
      expect(err).toBeInstanceOf(VouchRailProviderError);
      expect((err as VouchRailProviderError).code).toBe(ERROR_CODES.PROVIDER_UNSUPPORTED_CLIENT);
    }
  });

  it('openai wrap handles a call invoked without arguments', async () => {
    const audit = makeLogger();
    const client = {
      chat: {
        completions: {
          create: async () => ({ id: 'cmpl-empty', choices: [] }),
        },
      },
    };
    const wrapped = audit.wrap(client, {
      caseId: 'case-openai-empty',
      promptTemplateId: 'tpl',
      promptTemplateVersion: '1.0',
      operatorId: 'op',
    });
    await (wrapped.chat.completions.create as () => Promise<unknown>)();
    const entries = [];
    for await (const e of (
      audit.backend as {
        list: (opts: {
          systemId: string;
        }) => AsyncIterable<{ modelName: string; modelProvider: string }>;
      }
    ).list({ systemId: 'sys-prov' })) {
      entries.push(e);
    }
    expect(entries).toHaveLength(1);
    expect(entries[0]!.modelProvider).toBe('openai');
    expect(entries[0]!.modelName).toBe('unknown');
    await audit.close();
  });

  it('anthropic wrap handles a call invoked without arguments', async () => {
    // args[0] is undefined; the wrapper falls back to {} for params and
    // records modelName/modelVersion as "unknown" so the entry still
    // satisfies the schema.
    const audit = makeLogger();
    const client = {
      messages: {
        create: async () => ({ id: 'msg-empty', content: [] }),
      },
    };
    const wrapped = audit.wrap(client, {
      caseId: 'case-empty-args',
      promptTemplateId: 'tpl',
      promptTemplateVersion: '1.0',
      operatorId: 'op',
    });
    // Cast to call without args.
    await (wrapped.messages.create as () => Promise<unknown>)();
    const entries = [];
    for await (const e of (
      audit.backend as {
        list: (opts: {
          systemId: string;
        }) => AsyncIterable<{ modelName: string; modelVersion: string }>;
      }
    ).list({ systemId: 'sys-prov' })) {
      entries.push(e);
    }
    expect(entries).toHaveLength(1);
    expect(entries[0]!.modelName).toBe('unknown');
    expect(entries[0]!.modelVersion).toBe('unknown');
    await audit.close();
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
