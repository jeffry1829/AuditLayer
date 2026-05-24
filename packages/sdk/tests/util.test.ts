import { describe, expect, it } from 'vitest';

import { deriveDurationMs, fingerprint, nowIso, uuidv4 } from '../src/util.js';
import { VouchRailSchemaError, ERROR_CODES } from '../src/errors.js';

describe('util', () => {
  describe('nowIso', () => {
    it('returns an ISO-8601 UTC timestamp ending in Z with millisecond precision', () => {
      expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('uuidv4', () => {
    it('produces a v4 UUID', () => {
      expect(uuidv4()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });
  });

  describe('deriveDurationMs', () => {
    it('returns the difference in milliseconds', () => {
      expect(deriveDurationMs('2026-05-19T00:00:00.000Z', '2026-05-19T00:00:01.250Z')).toBe(1250);
    });

    it('clamps a negative duration to zero (clock skew)', () => {
      expect(deriveDurationMs('2026-05-19T00:00:01.000Z', '2026-05-19T00:00:00.000Z')).toBe(0);
    });

    it('throws VouchRailSchemaError when either bound is not parseable as ISO', () => {
      try {
        deriveDurationMs('not-a-date', '2026-05-19T00:00:00.000Z');
        throw new Error('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(VouchRailSchemaError);
        expect((err as VouchRailSchemaError).code).toBe(ERROR_CODES.SCHEMA_INVALID_TIMESTAMP);
      }
    });
  });

  describe('fingerprint', () => {
    it('returns 64 lowercase hex chars for a JSON-compatible value', () => {
      expect(fingerprint({ a: 1, b: 'two' })).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is canonical: key order does not change the result', () => {
      expect(fingerprint({ a: 1, b: 2 })).toBe(fingerprint({ b: 2, a: 1 }));
    });

    it('treats undefined input as null', () => {
      expect(fingerprint(undefined)).toBe(fingerprint(null));
    });
  });
});
