import { describe, expect, it } from 'vitest';

import {
  AuditLayerConfigError,
  AuditLayerError,
  AuditLayerPiiError,
  AuditLayerProviderError,
  AuditLayerSchemaError,
  AuditLayerSignerError,
  AuditLayerStorageError,
  ERROR_CODES,
} from '../src/errors.js';

describe('AuditLayerError', () => {
  it('carries code + immutable context', () => {
    const err = new AuditLayerConfigError(ERROR_CODES.CONFIG_INVALID, 'msg', { foo: 'bar' });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AuditLayerError);
    expect(err).toBeInstanceOf(AuditLayerConfigError);
    expect(err.code).toBe(ERROR_CODES.CONFIG_INVALID);
    expect(err.context).toEqual({ foo: 'bar' });
    expect(Object.isFrozen(err.context)).toBe(true);
  });

  it('subclasses do not collide', () => {
    const cfg = new AuditLayerConfigError(ERROR_CODES.CONFIG_INVALID, 'm');
    const store = new AuditLayerStorageError(ERROR_CODES.STORAGE_BAD_JSON, 'm');
    const schema = new AuditLayerSchemaError(ERROR_CODES.SCHEMA_HASH_RECHECK_FAILED, 'm');
    const signer = new AuditLayerSignerError(ERROR_CODES.SIGNER_INVALID_SECRET, 'm');
    const provider = new AuditLayerProviderError(ERROR_CODES.PROVIDER_UNSUPPORTED_CLIENT, 'm');
    const pii = new AuditLayerPiiError(ERROR_CODES.PII_TOKEN_STORE_MISSING, 'm');
    expect(cfg).not.toBeInstanceOf(AuditLayerStorageError);
    expect(store).not.toBeInstanceOf(AuditLayerConfigError);
    expect(schema).not.toBeInstanceOf(AuditLayerSignerError);
    expect(signer).not.toBeInstanceOf(AuditLayerProviderError);
    expect(provider).not.toBeInstanceOf(AuditLayerPiiError);
    expect(pii).not.toBeInstanceOf(AuditLayerSchemaError);
  });

  it('all codes are stable strings (no collisions, no empties)', () => {
    const values = Object.values(ERROR_CODES);
    const set = new Set(values);
    expect(set.size).toBe(values.length);
    for (const v of values) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
      expect(v.startsWith('AUDITLAYER_')).toBe(true);
    }
  });

  it('error name matches its class', () => {
    expect(new AuditLayerConfigError(ERROR_CODES.CONFIG_INVALID, 'x').name).toBe(
      'AuditLayerConfigError',
    );
    expect(new AuditLayerStorageError(ERROR_CODES.STORAGE_BAD_JSON, 'x').name).toBe(
      'AuditLayerStorageError',
    );
  });
});
