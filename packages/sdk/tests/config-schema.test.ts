import { describe, expect, it } from 'vitest';

import {
  FileBackedAuditConfigSchema,
  HashChainConfigSchema,
  PiiRedactionConfigSchema,
  RetentionConfigSchema,
  StorageConfigSchema,
} from '../src/config-schema.js';

describe('FileBackedAuditConfigSchema', () => {
  it('accepts a minimal local-backend config', () => {
    const ok = FileBackedAuditConfigSchema.safeParse({
      systemId: 'sys',
      storage: { type: 'local', dir: './audit-logs' },
    });
    expect(ok.success).toBe(true);
  });

  it('accepts a complete s3-backend config', () => {
    const ok = FileBackedAuditConfigSchema.safeParse({
      systemId: 'sys',
      storage: {
        type: 's3',
        bucket: 'b',
        region: 'eu-west-1',
        prefix: 'p',
        workMode: true,
        endpoint: 'https://s3.example.com',
      },
    });
    expect(ok.success).toBe(true);
  });

  it('rejects unknown storage type', () => {
    const r = FileBackedAuditConfigSchema.safeParse({
      systemId: 'sys',
      storage: { type: 'gcs' as 'local', dir: 'x' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects missing systemId', () => {
    const r = FileBackedAuditConfigSchema.safeParse({
      storage: { type: 'local', dir: 'x' },
    });
    expect(r.success).toBe(false);
  });

  it('rejects extra root keys (strict)', () => {
    const r = FileBackedAuditConfigSchema.safeParse({
      systemId: 'sys',
      storage: { type: 'local', dir: 'x' },
      bogus: 1,
    });
    expect(r.success).toBe(false);
  });

  it('rejects systemId that fails the path-segment regex', () => {
    // Defense in depth: the SDK constructor also calls assertSafePathSegment,
    // but the Zod schema MUST reject the same inputs so CLI configs fail at
    // parse time, before any backend is constructed.
    for (const bad of ['../escape', '.', '..', 'with space', 'with/slash', 'with:colon']) {
      const r = FileBackedAuditConfigSchema.safeParse({
        systemId: bad,
        storage: { type: 'local', dir: '/tmp' },
      });
      expect(r.success).toBe(false);
    }
    // Sanity: a clean identifier passes.
    const ok = FileBackedAuditConfigSchema.safeParse({
      systemId: 'sys-1_demo.app',
      storage: { type: 'local', dir: '/tmp' },
    });
    expect(ok.success).toBe(true);
  });
});

describe('StorageConfigSchema', () => {
  it('local requires dir', () => {
    const r = StorageConfigSchema.safeParse({ type: 'local' });
    expect(r.success).toBe(false);
  });
  it('s3 requires bucket + region', () => {
    const r = StorageConfigSchema.safeParse({ type: 's3', bucket: 'b' });
    expect(r.success).toBe(false);
  });
});

describe('RetentionConfigSchema', () => {
  it('rejects negative days', () => {
    const r = RetentionConfigSchema.safeParse({ minimumDays: -1, targetDays: 10 });
    expect(r.success).toBe(false);
  });
});

describe('HashChainConfigSchema', () => {
  it('only allows sha256', () => {
    expect(HashChainConfigSchema.safeParse({ enabled: true, algorithm: 'sha256' }).success).toBe(
      true,
    );
    expect(
      HashChainConfigSchema.safeParse({ enabled: true, algorithm: 'md5' as 'sha256' }).success,
    ).toBe(false);
  });
});

describe('PiiRedactionConfigSchema', () => {
  it('rejects unknown built-in pattern id', () => {
    const r = PiiRedactionConfigSchema.safeParse({
      enabled: true,
      strategy: 'hash',
      patterns: { mysteryPattern: true } as Record<string, boolean>,
    });
    expect(r.success).toBe(false);
  });

  it('accepts a typical config', () => {
    const r = PiiRedactionConfigSchema.safeParse({
      enabled: true,
      strategy: 'pseudonymize',
      patterns: { email: true, phone: true },
      tokenStore: { type: 'memory' },
    });
    expect(r.success).toBe(true);
  });

  it('compiles customPatterns strings into global RegExp', () => {
    const r = PiiRedactionConfigSchema.safeParse({
      enabled: true,
      strategy: 'hash',
      customPatterns: { ticket: 'TICKET-\\d+' },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      const re = r.data.customPatterns!['ticket'];
      expect(re).toBeInstanceOf(RegExp);
      expect(re!.flags).toContain('g');
      expect(re!.source).toBe('TICKET-\\d+');
    }
  });

  it('accepts pre-built RegExp values in customPatterns alongside strings', () => {
    const r = PiiRedactionConfigSchema.safeParse({
      enabled: true,
      strategy: 'hash',
      customPatterns: { rx: /CASE-\d+/g, str: '\\bORD-\\d+\\b' },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.customPatterns!['rx']).toBeInstanceOf(RegExp);
      expect(r.data.customPatterns!['str']).toBeInstanceOf(RegExp);
    }
  });
});
