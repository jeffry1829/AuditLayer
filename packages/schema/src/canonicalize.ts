/**
 * JSON Canonicalization Scheme (JCS) — RFC 8785.
 *
 * Produces a deterministic byte representation of a JSON-compatible value so
 * that two parties computing the hash of the same entry compute the same
 * hash. Required for the AuditLayer hash chain.
 *
 * Rules implemented:
 * - UTF-8 output (the returned string is UTF-8 when encoded).
 * - Object keys sorted by Unicode code-point (i.e., the same order as the
 *   ECMAScript `<` operator on strings produced from JSON).
 * - No insignificant whitespace.
 * - Strings serialized with JSON.stringify, which produces the JCS short-form
 *   escapes for U+0000–U+001F, U+0022 (`"`), and U+005C (`\\`).
 * - Numbers serialized per RFC 8785 §3.2.2.3 by reusing ECMA-404 / ECMA-262
 *   ToString(Number) which matches what `JSON.stringify` already produces.
 * - `null`, `true`, `false` serialized as the literal tokens.
 * - Arrays serialized in declared order with no insignificant whitespace.
 *
 * Constraints:
 * - `undefined` values inside objects are dropped (matches JSON.stringify).
 * - `undefined` values inside arrays are serialized as `null` (matches
 *   JSON.stringify). The audit log schema does not currently store
 *   arrays of undefined.
 * - `NaN` / `Infinity` are not valid JCS and throw.
 * - `bigint` is not valid JCS and throws.
 * - Circular structures throw via the visited-set check.
 *
 * The output string is intended to be hashed as UTF-8 bytes
 * (`Buffer.from(s, 'utf8')`).
 */

const SAFE_INTEGER_LIMIT = Number.MAX_SAFE_INTEGER;

export function canonicalize(value: unknown): string {
  const seen = new WeakSet<object>();
  return serialize(value, seen);
}

/**
 * Convenience wrapper returning the UTF-8 bytes of the canonical form. The
 * audit log hash chain hashes these bytes.
 */
export function canonicalizeForHash(value: unknown): Buffer {
  return Buffer.from(canonicalize(value), 'utf8');
}

function serialize(value: unknown, seen: WeakSet<object>): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      return serializeNumber(value);
    case 'string':
      return JSON.stringify(value);
    case 'bigint':
      throw new TypeError('canonicalize: bigint is not representable in JCS');
    case 'undefined':
    case 'function':
    case 'symbol':
      // Unreachable at object level (filtered upstream) and arrays handle
      // undefined explicitly. Throw to make programmer errors loud.
      throw new TypeError(`canonicalize: value of type ${typeof value} is not representable`);
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError('canonicalize: circular array');
    seen.add(value);
    const parts = value.map((item) => {
      if (item === undefined) return 'null';
      return serialize(item, seen);
    });
    seen.delete(value);
    return `[${parts.join(',')}]`;
  }

  // Plain object
  if (typeof value === 'object') {
    if (seen.has(value as object)) throw new TypeError('canonicalize: circular object');
    seen.add(value as object);
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
    keys.sort(compareCodePoint);
    const parts = keys.map((k) => `${JSON.stringify(k)}:${serialize(obj[k], seen)}`);
    seen.delete(value as object);
    return `{${parts.join(',')}}`;
  }

  throw new TypeError(`canonicalize: unsupported value type ${typeof value}`);
}

function serializeNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new TypeError('canonicalize: non-finite numbers are not valid JCS');
  }
  if (Number.isInteger(n) && Math.abs(n) <= SAFE_INTEGER_LIMIT) {
    return String(n);
  }
  // JSON.stringify uses the ECMAScript Number ToString algorithm, which RFC
  // 8785 §3.2.2.3 references. This produces canonical exponential / decimal
  // forms with no trailing zeros.
  const s = JSON.stringify(n);
  if (s === undefined) {
    throw new TypeError('canonicalize: number not representable');
  }
  return s;
}

function compareCodePoint(a: string, b: string): number {
  // Default JS string comparison is by UTF-16 code unit; for the BMP range
  // and lone surrogate-free strings this matches Unicode code-point order.
  // Object keys in JS are strings, and RFC 8785 §3.2.3 specifies sorting by
  // UTF-16 code units of the serialized member-name string.
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
