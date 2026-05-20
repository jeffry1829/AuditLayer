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
});
