import { createHash } from 'node:crypto';

import { canonicalizeForHash } from './canonicalize.js';
import type { AuditLogEntry, AuditLogEntryInput } from './types.js';

export const HASH_ALGORITHM = 'sha256' as const;

/**
 * The hash assigned to `previousEntryHash` for the first (genesis) entry of a
 * chain. We use the SHA-256 of the ASCII string "auditlayer:genesis-v1" so
 * that the constant is stable across all installations and recognisable in
 * verification tooling.
 */
export const GENESIS_PREVIOUS_HASH = createHash('sha256')
  .update('auditlayer:genesis-v1', 'utf8')
  .digest('hex');

/**
 * Compute the canonical entry hash for an entry that already has a
 * `previousEntryHash` set. The hash covers ALL non-cryptographic fields
 * AND the `previousEntryHash` field — but NOT `entryHash` or `signature`.
 *
 * This is the field shape the audit chain depends on: changing any logged
 * field changes the entry hash; changing the previous entry's hash changes
 * the chain link.
 */
export function computeEntryHash(entry: Omit<AuditLogEntry, 'entryHash' | 'signature'>): string {
  const canonicalBytes = canonicalizeForHash(entry);
  return createHash(HASH_ALGORITHM).update(canonicalBytes).digest('hex');
}

/**
 * Take an `AuditLogEntryInput` (the user-supplied fields with no chain
 * metadata) and the previous entry in the chain (or null for the first
 * entry), and return a new partial entry with `previousEntryHash` and
 * `entryHash` populated. The signature must be applied by the SDK because it
 * depends on an external signing key.
 */
export function linkEntry(
  input: AuditLogEntryInput,
  previousEntry: AuditLogEntry | null,
): Omit<AuditLogEntry, 'signature'> {
  const previousEntryHash = previousEntry ? previousEntry.entryHash : GENESIS_PREVIOUS_HASH;
  const candidate = {
    ...input,
    previousEntryHash,
  } satisfies Omit<AuditLogEntry, 'entryHash' | 'signature'>;
  const entryHash = computeEntryHash(candidate);
  return {
    ...candidate,
    entryHash,
  };
}

/**
 * Re-compute the entry hash of a stored entry and compare it to the
 * recorded `entryHash`. Returns true if the entry has not been modified.
 */
export function verifyEntryHash(entry: AuditLogEntry): boolean {
  // Strip the existing entryHash + signature, recompute, compare.
  // We intentionally keep the previousEntryHash because it is part of the
  // hashed payload.
  const { entryHash, signature: _signature, ...rest } = entry;
  void _signature;
  const expected = computeEntryHash(rest);
  return entryHash === expected;
}

export type ChainVerificationResult =
  | { valid: true }
  | {
      valid: false;
      brokenAt: number;
      reason: 'entry_hash_mismatch' | 'chain_link_mismatch' | 'genesis_link_mismatch';
      detail?: string;
    };

/**
 * Verify a sequence of entries in chronological order:
 *
 * - The first entry's `previousEntryHash` must equal `GENESIS_PREVIOUS_HASH`.
 * - Every subsequent entry's `previousEntryHash` must equal the prior entry's
 *   `entryHash`.
 * - Every entry's `entryHash` must match a fresh recomputation.
 */
export function verifyChain(entries: AuditLogEntry[]): ChainVerificationResult {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const prev = i === 0 ? null : entries[i - 1]!;

    if (!verifyEntryHash(entry)) {
      return {
        valid: false,
        brokenAt: i,
        reason: 'entry_hash_mismatch',
        detail: `entry at index ${i} (callId=${entry.callId}) has been modified`,
      };
    }

    const expectedPrev = prev ? prev.entryHash : GENESIS_PREVIOUS_HASH;
    if (entry.previousEntryHash !== expectedPrev) {
      return {
        valid: false,
        brokenAt: i,
        reason: i === 0 ? 'genesis_link_mismatch' : 'chain_link_mismatch',
        detail: `entry at index ${i} (callId=${entry.callId}) does not link to previous entry`,
      };
    }
  }
  return { valid: true };
}
