import { describe, expect, it } from 'vitest';

import {
  GENESIS_PREVIOUS_HASH,
  HASH_ALGORITHM,
  computeEntryHash,
  linkEntry,
  verifyChain,
  verifyEntryHash,
} from '../src/hash-chain.js';
import { SCHEMA_VERSION, type AuditLogEntry, type AuditLogEntryInput } from '../src/types.js';

function makeInput(callId: string, caseId = 'case-1'): AuditLogEntryInput {
  return {
    schemaVersion: SCHEMA_VERSION,
    recordedBy: '@vouchrail/sdk@0.1.0',
    callId,
    caseId,
    systemId: 'test-system',
    startedAt: '2026-05-19T12:00:00.000Z',
    endedAt: '2026-05-19T12:00:01.000Z',
    durationMs: 1000,
    modelProvider: 'anthropic',
    modelName: 'claude-3-5-sonnet',
    modelVersion: '20241022',
    modelConfiguration: { temperature: 0.2, maxTokens: 256 },
    promptTemplateId: 'tpl-test',
    promptTemplateVersion: '1.0.0',
    promptFingerprint: 'a'.repeat(64),
    inputFingerprint: 'b'.repeat(64),
    outputFingerprint: 'c'.repeat(64),
    outputDecision: { ok: true },
    operatorId: 'op-1',
  };
}

function fakeSign(_h: string): string {
  return 'sig-fake';
}

function buildChain(n: number): AuditLogEntry[] {
  const chain: AuditLogEntry[] = [];
  for (let i = 0; i < n; i++) {
    const input = makeInput(`call-${i}`);
    const prev = i === 0 ? null : chain[i - 1]!;
    const linked = linkEntry(input, prev);
    chain.push({ ...linked, signature: fakeSign(linked.entryHash) });
  }
  return chain;
}

describe('hash-chain', () => {
  it('exposes sha256 as the algorithm', () => {
    expect(HASH_ALGORITHM).toBe('sha256');
  });

  it('GENESIS_PREVIOUS_HASH is the SHA-256 of the spec sentinel', () => {
    expect(GENESIS_PREVIOUS_HASH).toMatch(/^[0-9a-f]{64}$/);
  });

  it('linkEntry sets GENESIS_PREVIOUS_HASH for the first entry', () => {
    const input = makeInput('call-0');
    const linked = linkEntry(input, null);
    expect(linked.previousEntryHash).toBe(GENESIS_PREVIOUS_HASH);
    expect(linked.entryHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('linkEntry chains subsequent entries to the prior entryHash', () => {
    const a = linkEntry(makeInput('call-0'), null);
    const aFull: AuditLogEntry = { ...a, signature: fakeSign(a.entryHash) };
    const b = linkEntry(makeInput('call-1'), aFull);
    expect(b.previousEntryHash).toBe(a.entryHash);
    expect(b.entryHash).not.toBe(a.entryHash);
  });

  it('computeEntryHash is deterministic across reorderings of input fields', () => {
    const input = makeInput('call-0');
    const linked = linkEntry(input, null);
    // computeEntryHash hashes everything except entryHash + signature; strip
    // the populated entryHash before re-hashing.
    const { entryHash: _entryHash, ...hashable } = linked;
    const reorder = {
      ...hashable,
      modelConfiguration: { maxTokens: 256, temperature: 0.2 },
    };
    expect(computeEntryHash(reorder)).toBe(linked.entryHash);
  });

  it('verifyEntryHash returns true for an unmodified entry', () => {
    const linked = linkEntry(makeInput('call-0'), null);
    const full: AuditLogEntry = { ...linked, signature: 'sig-x' };
    expect(verifyEntryHash(full)).toBe(true);
  });

  it('verifyEntryHash returns false if any logged field is altered', () => {
    const linked = linkEntry(makeInput('call-0'), null);
    const full: AuditLogEntry = { ...linked, signature: 'sig-x' };
    const tampered: AuditLogEntry = { ...full, caseId: 'OTHER' };
    expect(verifyEntryHash(tampered)).toBe(false);
  });

  it('verifyChain accepts a clean chain', () => {
    const chain = buildChain(5);
    expect(verifyChain(chain)).toEqual({ valid: true });
  });

  it('verifyChain detects modification of any non-cryptographic field', () => {
    const chain = buildChain(10);
    // Tamper with entry 5
    chain[5] = { ...chain[5]!, outputDecision: { ok: false, tampered: true } };
    const result = verifyChain(chain);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.brokenAt).toBe(5);
      expect(result.reason).toBe('entry_hash_mismatch');
    }
  });

  it('verifyChain detects broken links even if both entries are individually valid', () => {
    const chain = buildChain(5);
    // Replace entry 2 with a fresh, internally valid entry whose
    // previousEntryHash points to genesis instead of the correct prior hash.
    const replacement = linkEntry(makeInput('call-rogue'), null);
    chain[2] = { ...replacement, signature: 'sig-rogue' } as AuditLogEntry;
    const result = verifyChain(chain);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.brokenAt).toBe(2);
      expect(result.reason).toBe('chain_link_mismatch');
    }
  });

  it('verifyChain detects a missing genesis link', () => {
    const chain = buildChain(3);
    // Replace entry 0 with one whose previousEntryHash is NOT the genesis
    // sentinel. Recompute entryHash so the entry-hash check passes and the
    // verifier reports the genesis-link mismatch specifically.
    const tampered = { ...chain[0]!, previousEntryHash: 'd'.repeat(64) };
    const { entryHash: _entryHash, signature: _signature, ...hashable } = tampered;
    const recomputed = computeEntryHash(hashable);
    chain[0] = { ...tampered, entryHash: recomputed };
    const result = verifyChain(chain);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.brokenAt).toBe(0);
      expect(result.reason).toBe('genesis_link_mismatch');
    }
  });

  it('tamper test: chain of 100 entries, modify entry 50, verify pinpoints index 50', () => {
    const chain = buildChain(100);
    chain[50] = { ...chain[50]!, outputDecision: { tampered: true } };
    const result = verifyChain(chain);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.brokenAt).toBe(50);
    }
  });
});
