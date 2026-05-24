# Architecture

How the pieces fit together.

## Layered design

```
┌────────────────────────────────────────────────────────────┐
│  Your application                                          │
│                                                            │
│   ┌──────────────────────────────────────────────────────┐ │
│   │  Agent framework or raw LLM SDK                      │ │
│   │  (Anthropic, OpenAI, LangGraph, Vercel AI, ...)      │ │
│   │                                                      │ │
│   │   ┌────────────────────────────────────────────┐     │ │
│   │   │  VouchRail SDK (@vouchrail/sdk / vouchrail) │     │ │
│   │   │  - wraps LLM calls                         │     │ │
│   │   │  - builds Article 12 entries               │     │ │
│   │   │  - computes hash chain                     │     │ │
│   │   │  - redacts PII                             │     │ │
│   │   │  - signs each entry                        │     │ │
│   │   │  - hands off to a storage backend          │     │ │
│   │   └────────────────────────────────────────────┘     │ │
│   └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼  signed, hash-chained JSONL
        ┌──────────────────────────────────────────┐
        │  Storage backend                         │
        │    local filesystem  /  customer S3      │
        │    (Object Lock + SSE-KMS recommended)   │
        └──────────────────────────────────────────┘
                            │
                            ▼  offline
        ┌──────────────────────────────────────────┐
        │  CLI: query / verify / export            │
        │  No VouchRail cloud required.            │
        └──────────────────────────────────────────┘
```

## Package layout

| Package                                          | Role                                                            |
| ------------------------------------------------ | --------------------------------------------------------------- |
| [`packages/schema`](../packages/schema)          | Types, Zod validators, JCS canonicalization, hash-chain helpers |
| [`packages/sdk`](../packages/sdk)                | `AuditLogger`, storage backends, PII, provider adapters         |
| [`packages/cli`](../packages/cli)                | TS CLI (`vouchrail`)                                            |
| [`python/`](../python)                           | Python SDK + CLI                                                |
| [`conformance-vectors/`](../conformance-vectors) | Cross-language byte-identity test vectors                       |
| [`examples/`](../examples)                       | HR, fintech, healthcare end-to-end demos                        |

## Why a separate audit layer

EU AI Act Article 12 expects four properties that observability tools (LangSmith, Langfuse, Datadog LLM) don't deliver:

- **Tamper-evidence.** SHA-256 hash chain + external signing key. One altered record breaks the chain at that exact point.
- **Regulator-shaped schema.** Model + prompt versions, input / output fingerprints, operator, human review, reason codes — the fields a regulator can match against the regulation text. See [Schema + hash chain](./schema.md).
- **Customer-owned storage.** Logs live in your S3 (or local disk). Vendor-hosted logs carry weaker evidentiary weight in court.
- **GDPR-compatible PII.** Pseudonymize at write time; the token store is deletable on request; the chain stays intact. See [PII redaction](./pii-redaction.md).

## Determinism + cross-language identity

The SDK never invents an entry shape per language. A single schema specification lives in `packages/schema` (TS reference) and is mirrored in `python/src/vouchrail/schema/`. Both implementations produce byte-identical:

1. JCS canonical form (RFC 8785)
2. Entry hash (SHA-256 over the canonical bytes)
3. Chain progression
4. HMAC-SHA256 inline-signer output

Sixteen conformance vectors live at `conformance-vectors/cases/*.json`. CI runs both implementations against every vector on every PR; any divergence fails the build. See [Cross-language conformance](./conformance.md).
