# Cross-language conformance

The TypeScript SDK and the Python SDK MUST produce byte-identical:

1. JCS canonical form (RFC 8785)
2. Entry hash (SHA-256 hex of the canonical bytes)
3. Hash-chain progression
4. HMAC-SHA256 inline-signer output (`hmac-sha256:inline:<hex>`)

If they ever diverge, a chain written by one and verified by the other reports a tamper false-positive. Sixteen test vectors at `conformance-vectors/cases/*.json` lock the behavior; CI runs both implementations against every vector on every PR.

## Vector format

```json
{
  "name": "human-readable-label",
  "description": "what pitfall this vector exercises",
  "input": {
    /* any JSON value */
  },
  "canonical": "the expected JCS canonical string",
  "sha256": "the expected SHA-256 hex of canonical.encode('utf-8')"
}
```

The `canonical` and `sha256` fields are generated from the TypeScript reference implementation (`conformance-vectors/runners/ts/run.ts generate`); the Python runner asserts against them.

## What's covered

- Empty primitives (`null`, `true`, `false`, `0`, `""`)
- Integers across the safe-integer boundary (±2^53)
- Floats with shortest round-trip — including the ECMA-262 positional/scientific cutoff at 1e-6 and the ≥1e21 boundary
- Strings with combining characters (NFC vs NFD pinned as distinct)
- Nested objects and arrays
- Keys with non-ASCII characters (sort by UTF-16 code unit)
- Empty arrays and objects
- Mixed `null` and absent fields
- Line- and paragraph-separator characters (U+2028, U+2029)
- Supplementary-plane characters (U+10000+) sort via surrogate pair encoding
- A realistic full `AuditLogEntryInput`

## Reference implementation

When in doubt, **TypeScript is the reference**. It was published first; existing customer chains depend on its hash output. Python conforms to it, not vice versa.

If a defect in the TypeScript canonicalizer requires a fix, the change is a **schema version bump** (`vouchrail-v1.0` → `vouchrail-v1.1`), documented in the changelog, with migration tooling provided.

## Running the suite locally

```bash
# TypeScript runner — verify
pnpm --filter './conformance-vectors/runners/ts' run verify

# TypeScript runner — regenerate canonical/sha256 (use after a schema change)
pnpm --filter './conformance-vectors/runners/ts' run generate

# Python runner
python conformance-vectors/runners/python/run.py
```

## Adding a vector

1. Drop a new file under `conformance-vectors/cases/` with `name`, `description`, and `input`.
2. Run the TS generator to fill in `canonical` and `sha256`.
3. Run the Python runner to confirm parity.
4. Open a PR; CI re-runs both.

If you find an input that hashes differently in either implementation, that's a real bug — open an issue and pin it as a failing vector first.
