# Schema + hash chain

What an audit entry looks like, how it maps to Article 12, and how the hash chain detects tampering.

## Article 12 field mapping

| Article 12 requirement                          | Field(s)                                                                                  |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 12(1) automatic recording of events             | Every entry is auto-emitted by `startCall` / `endCall` / wrapped client                   |
| 12(2)(a) identify risk situations               | `riskFlags`, `incidentId`                                                                 |
| 12(2)(b) post-market monitoring                 | Entries queryable by `startedAt`; aggregation supported                                   |
| 12(2)(c) deployer operation monitoring          | `operatorId`, `humanReview`                                                               |
| 12(3)(a) period of each use                     | `startedAt`, `endedAt`, `durationMs`                                                      |
| 12(3)(b) reference database checked             | `referenceDatabase`                                                                       |
| 12(3)(c) input data that led to match           | `inputFingerprint`, `inputPiiRedacted`                                                    |
| 12(3)(d) verification personnel identification  | `humanReview.reviewerId`, `operatorId`                                                    |
| Article 11 technical documentation traceability | `modelProvider`, `modelName`, `modelVersion`, `promptTemplateId`, `promptTemplateVersion` |
| Article 14 human oversight evidence             | `humanReview`                                                                             |
| Article 17 QMS retention                        | `retention.targetDays` (configurable)                                                     |
| Article 26(6) deployer 6-month minimum          | `retention.minimumDays` (configurable)                                                    |
| Article 72 post-market monitoring data          | Aggregation via query; drift signals via `riskFlags`                                      |

## Entry shape

```ts
interface AuditLogEntry {
  // Identity
  schemaVersion: 'vouchrail-v1.0';
  recordedBy: string; // "@vouchrail/sdk@0.1.0" or "vouchrail@0.1.0"
  callId: string; // UUID v4
  parentCallId?: string; // for agent call trees
  caseId: string; // your business case ID
  sessionId?: string; // multi-turn conversations
  systemId: string; // matches the AuditLogger's systemId

  // Timing
  startedAt: string; // ISO-8601 UTC, ms precision, Z suffix
  endedAt: string;
  durationMs: number;

  // Model identity
  modelProvider: 'anthropic' | 'openai' | 'google' | 'azure' | 'self_hosted' | string;
  modelName: string;
  modelVersion: string;
  modelConfiguration: Record<string, unknown>;

  // Prompt provenance
  promptTemplateId: string;
  promptTemplateVersion: string;
  promptFingerprint: string; // SHA-256 hex of canonical(prompt)

  // Input
  inputFingerprint: string; // SHA-256 hex of canonical(redacted input)
  inputPiiRedacted?: {
    fields: string[]; // e.g. "root.resume:email"
    pseudonymKey?: string; // caseId when strategy=pseudonymize
  };
  referenceDatabase?: string;

  // Tools (for agentic systems)
  toolCalls?: Array<{
    /* ... */
  }>;

  // Output
  outputFingerprint: string; // matches canonical(outputDecision)
  outputDecision: unknown;
  reasonCodes?: string[];

  // Oversight
  operatorId: string;
  humanReview?: {
    reviewerId: string;
    reviewedAt: string;
    decision: 'approve' | 'override' | 'escalate';
    rationale?: string;
    finalDecision?: unknown;
  };

  // Risk
  riskFlags?: string[];
  incidentId?: string;

  // Chain
  entryHash: string; // SHA-256 hex over canonical(everything except entryHash + signature)
  previousEntryHash: string; // SHA-256 hex of the prior entry; genesis sentinel for the first entry
  signature: string; // the signer's signature over entryHash
}
```

Full Zod runtime validator is `AuditLogEntrySchema` in `@vouchrail/schema`.

## JCS canonicalization

The hash chain is only useful if two parties can agree on the bytes being hashed. We use **JSON Canonicalization Scheme (RFC 8785)**:

- UTF-8 output bytes
- Object keys sorted by UTF-16 code unit order
- No insignificant whitespace
- Numbers serialized per ECMA-262 NumberToString (shortest round-trip; matches `JSON.stringify`)
- Strings escape only the JCS short-form set
- `null` / `true` / `false` lowercase
- `NaN` / `±Infinity` / `bigint` raise — not valid JCS

Notes:

- The TS canonicalizer drops keys whose value is `undefined`; the Python canonicalizer keeps `None` (Python has no `undefined` sentinel). Callers pick semantics by deciding whether to include the key. Conformance vector 13 pins this.
- Strings are NOT auto-NFC-normalized. NFC-composed and NFD-decomposed forms hash differently. Conformance vector 12 pins this. Callers should NFC-normalize upstream if they want logically-equal strings to hash equally.

## Hash chain

```
Entry N:
  previousEntryHash = (N === 0 ? GENESIS_PREVIOUS_HASH : entries[N-1].entryHash)
  entryHash         = sha256(canonical({ all fields including previousEntryHash, excluding entryHash + signature }))
  signature         = signer.sign(entryHash)
```

`GENESIS_PREVIOUS_HASH` is `sha256('vouchrail:genesis-v1')`. It's a public, stable constant so verifiers can compute it from scratch.

## Verification

```ts
import { verifyChain } from '@vouchrail/schema';

const result = verifyChain(entries);
if (!result.valid) {
  console.error(`Chain broken at index ${result.brokenAt}: ${result.reason}`);
  // reason ∈ { 'entry_hash_mismatch', 'chain_link_mismatch', 'genesis_link_mismatch' }
}
```

The `vouchrail verify` CLI wraps this with storage-backend reads and human-friendly output. See [CLI usage](./cli.md).

## Schema versioning

The `schemaVersion` field is the source of truth. We do not silently break the schema. Any breaking change requires a new value (e.g., `vouchrail-v1.0` → `vouchrail-v2.0`) and a migration note.

The conformance vectors enforce byte-identity across the TS and Python SDKs. CI runs both implementations against every vector on every PR. See [Cross-language conformance](./conformance.md).
