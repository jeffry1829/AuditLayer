import { describe, expect, it } from 'vitest';

import { canonicalize, canonicalizeForHash } from '../src/canonicalize.js';

describe('canonicalize (RFC 8785 JCS)', () => {
  it('sorts object keys by code point', () => {
    const v = { b: 2, a: 1, z: 26 };
    expect(canonicalize(v)).toBe('{"a":1,"b":2,"z":26}');
  });

  it('produces stable output regardless of insertion order', () => {
    const a = canonicalize({ x: 1, y: 2, z: 3 });
    const b = canonicalize({ z: 3, y: 2, x: 1 });
    expect(a).toBe(b);
  });

  it('serializes nested objects with sorted keys', () => {
    const v = { outer: { b: 'two', a: 'one' }, a: 1 };
    expect(canonicalize(v)).toBe('{"a":1,"outer":{"a":"one","b":"two"}}');
  });

  it('serializes arrays in order', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
  });

  it('serializes booleans, null', () => {
    expect(canonicalize(true)).toBe('true');
    expect(canonicalize(false)).toBe('false');
    expect(canonicalize(null)).toBe('null');
  });

  it('serializes strings with JSON escaping', () => {
    expect(canonicalize('hello')).toBe('"hello"');
    expect(canonicalize('he said "hi"')).toBe('"he said \\"hi\\""');
    expect(canonicalize('line1\nline2')).toBe('"line1\\nline2"');
  });

  it('drops undefined object values', () => {
    expect(canonicalize({ a: 1, b: undefined, c: 3 })).toBe('{"a":1,"c":3}');
  });

  it('serializes undefined inside arrays as null', () => {
    expect(canonicalize([1, undefined, 3])).toBe('[1,null,3]');
  });

  it('rejects NaN and Infinity', () => {
    expect(() => canonicalize(Number.NaN)).toThrow(/non-finite/);
    expect(() => canonicalize(Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
  });

  it('rejects bigint', () => {
    expect(() => canonicalize(BigInt(10))).toThrow(/bigint/);
  });

  it('rejects circular references', () => {
    const a: Record<string, unknown> = { x: 1 };
    a.self = a;
    expect(() => canonicalize(a)).toThrow(/circular/);
  });

  it('emits UTF-8 buffer via canonicalizeForHash', () => {
    const buf = canonicalizeForHash({ a: 'café' });
    expect(Buffer.isBuffer(buf)).toBe(true);
    // "café" in UTF-8 = 63 61 66 c3 a9
    const hex = buf.toString('hex');
    expect(hex).toContain('636166c3a9');
  });

  it('serializes integers without floating-point form', () => {
    expect(canonicalize(0)).toBe('0');
    expect(canonicalize(-7)).toBe('-7');
    expect(canonicalize(1000000)).toBe('1000000');
  });

  it('serializes non-integer numbers via JSON.stringify form', () => {
    expect(canonicalize(1.5)).toBe('1.5');
    expect(canonicalize(0.1 + 0.2)).toBe(String(0.1 + 0.2));
  });

  it('keeps deterministic output for unicode keys', () => {
    const v = { é: 1, a: 2 };
    expect(canonicalize(v)).toBe('{"a":2,"é":1}');
  });
});
