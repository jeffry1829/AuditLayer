import { describe, expect, it } from 'vitest';

import { detectPii, hashString, InMemoryPiiTokenStore, PiiRedactor } from '../src/pii.js';

describe('detectPii', () => {
  it('detects emails when enabled', () => {
    const m = detectPii('contact alice@example.com please', { email: true });
    expect(m.find((x) => x.patternName === 'email')?.match).toBe('alice@example.com');
  });

  it('does not detect what is not enabled', () => {
    const m = detectPii('alice@example.com', {});
    expect(m).toHaveLength(0);
  });

  it('detects SSN-style strings', () => {
    const m = detectPii('SSN 123-45-6789 ok', { ssn: true });
    expect(m.find((x) => x.patternName === 'ssn')?.match).toBe('123-45-6789');
  });

  it('detects multiple matches in a single string', () => {
    const m = detectPii('a@b.com and c@d.io', { email: true });
    expect(m).toHaveLength(2);
  });

  it('accepts custom patterns', () => {
    const m = detectPii('CASE-12345', {}, { caseRef: /CASE-\d+/g });
    expect(m).toHaveLength(1);
    expect(m[0]!.patternName).toBe('caseRef');
  });
});

describe('InMemoryPiiTokenStore', () => {
  it('returns stable tokens for the same value within a case', async () => {
    const store = new InMemoryPiiTokenStore();
    const t1 = await store.getOrCreateToken('case-1', 'email', 'a@b.com');
    const t2 = await store.getOrCreateToken('case-1', 'email', 'a@b.com');
    expect(t1).toBe(t2);
    expect(t1).toMatch(/^pii:[0-9a-f]{16}$/);
  });

  it('reveals the original value for a known token', async () => {
    const store = new InMemoryPiiTokenStore();
    const t = await store.getOrCreateToken('case-1', 'phone', '+1 555 1234');
    expect(await store.reveal(t)).toBe('+1 555 1234');
  });

  it('returns null for unknown tokens', async () => {
    const store = new InMemoryPiiTokenStore();
    expect(await store.reveal('pii:deadbeefdeadbeef')).toBeNull();
  });

  it('eraseCase removes tokens for the case (GDPR)', async () => {
    const store = new InMemoryPiiTokenStore();
    const t = await store.getOrCreateToken('case-erase', 'email', 'erase@me.com');
    store.eraseCase('case-erase');
    expect(await store.reveal(t)).toBeNull();
  });
});

describe('PiiRedactor', () => {
  it('passes through values when disabled', async () => {
    const r = new PiiRedactor({ enabled: false, strategy: 'pseudonymize' }, null);
    const result = await r.redact({ email: 'a@b.com' }, 'case-x');
    expect(result.redacted).toEqual({ email: 'a@b.com' });
    expect(result.fieldsTouched).toEqual([]);
  });

  it('refuses pseudonymize without a token store', () => {
    expect(() => new PiiRedactor({ enabled: true, strategy: 'pseudonymize' }, null)).toThrow(
      /token store/,
    );
  });

  it('pseudonymizes detected PII into stable tokens', async () => {
    const store = new InMemoryPiiTokenStore();
    const r = new PiiRedactor(
      {
        enabled: true,
        strategy: 'pseudonymize',
        patterns: { email: true },
      },
      store,
    );
    const result = await r.redact({ msg: 'mail me at a@b.com' }, 'case-y');
    const redacted = result.redacted as { msg: string };
    expect(redacted.msg).toMatch(/^mail me at pii:[0-9a-f]{16}$/);
    expect(result.fieldsTouched.length).toBeGreaterThan(0);
    expect(result.pseudonymKey).toBe('case-y');
  });

  it('hash strategy replaces with hash prefix', async () => {
    const r = new PiiRedactor(
      {
        enabled: true,
        strategy: 'hash',
        patterns: { email: true },
      },
      null,
    );
    const result = await r.redact({ msg: 'a@b.com' }, 'case-z');
    expect((result.redacted as { msg: string }).msg).toMatch(/^pii-h:[0-9a-f]{16}$/);
  });

  it('remove strategy replaces with REDACTED token', async () => {
    const r = new PiiRedactor(
      {
        enabled: true,
        strategy: 'remove',
        patterns: { email: true },
      },
      null,
    );
    const result = await r.redact({ msg: 'a@b.com here' }, 'case-q');
    expect((result.redacted as { msg: string }).msg).toBe('[REDACTED] here');
  });

  it('walks nested objects and arrays', async () => {
    const store = new InMemoryPiiTokenStore();
    const r = new PiiRedactor(
      {
        enabled: true,
        strategy: 'pseudonymize',
        patterns: { email: true },
      },
      store,
    );
    const result = await r.redact(
      { users: [{ contact: 'x@y.com' }, { contact: 'z@y.com' }] },
      'case-walk',
    );
    const out = result.redacted as { users: Array<{ contact: string }> };
    expect(out.users[0]!.contact).toMatch(/^pii:[0-9a-f]{16}$/);
    expect(out.users[1]!.contact).toMatch(/^pii:[0-9a-f]{16}$/);
    expect(out.users[0]!.contact).not.toBe(out.users[1]!.contact);
  });
});

describe('hashString', () => {
  it('produces a 64-char hex string', () => {
    expect(hashString('hello')).toMatch(/^[0-9a-f]{64}$/);
  });
});
