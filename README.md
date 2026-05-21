# AuditLayer

**Tamper-evident audit logs for production AI systems. Designed to support EU AI Act Article 12 record-keeping. TypeScript and Python.**

[![CI](https://github.com/jeffry1829/AuditLayer/actions/workflows/ci.yml/badge.svg)](https://github.com/jeffry1829/AuditLayer/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![Status](https://img.shields.io/badge/status-alpha-orange)](#status)

EU AI Act Article 12 takes effect **2 Aug 2026**. Every high-risk AI system (HR / credit / insurance / healthcare / education) must keep automatic, reconstructable, tamper-evident logs for ≥ 6 months.

Your observability tool (LangSmith / Langfuse / Datadog LLM) is for engineer debugging. It is not built for regulator audit. AuditLayer sits alongside it and adds the compliance evidence chain.

---

## What you get

|                |                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| **Two SDKs**   | TypeScript (`@auditlayer/sdk`) + Python (`auditlayer`). One hash chain — written by either, verified by either. |
| **Schema**     | One JSON record per AI decision. Fields map to Article 12(2)(a)–(c) + 12(3)(a)–(d).                             |
| **Hash chain** | SHA-256 + RFC 8785 (JCS) canonicalization. Cross-language byte-identical.                                       |
| **Storage**    | Customer-owned. Local filesystem or S3 (Object Lock + SSE-KMS).                                                 |
| **PII**        | Regex-based redaction with pseudonymization. Token store is GDPR-deletable.                                     |
| **CLI**        | `init` / `query` / `verify` / `export`. Verification works fully offline.                                       |
| **License**    | Apache-2.0. Fork-and-self-host forever.                                                                         |

---

## Quickstart — TypeScript

```bash
pnpm add @auditlayer/sdk
```

```ts
import Anthropic from '@anthropic-ai/sdk';
import { AuditLogger } from '@auditlayer/sdk';

const audit = new AuditLogger({
  systemId: 'hireflow-resume-screener',
  storage: { type: 'local', dir: './audit-logs' },
  signingKey: { kind: 'inline', secret: process.env.AUDIT_SIGNING_KEY! },
});

const anthropic = audit.wrap(new Anthropic(), {
  caseId: 'candidate-12345',
  promptTemplateId: 'resume-scoring-v3',
  promptTemplateVersion: '3.2.1',
  operatorId: 'system',
});

await anthropic.messages.create({
  /* … */
});
```

Verify the chain (offline — no AuditLayer cloud required):

```bash
npx @auditlayer/cli verify --storage-dir ./audit-logs --system-id hireflow-resume-screener
# ✔ Chain valid. N entries verified.
```

---

## Quickstart — Python

```bash
pip install auditlayer
```

```python
import os
from anthropic import Anthropic
from auditlayer import AuditLogger, InlineSigner, LocalStorageBackend, WrapContext

audit = AuditLogger(
    system_id="hireflow-resume-screener",
    storage=LocalStorageBackend(dir="./audit-logs"),
    signer=InlineSigner(os.environ["AUDIT_SIGNING_KEY"]),
)

anthropic = audit.wrap(
    Anthropic(),
    WrapContext(
        case_id="candidate-12345",
        prompt_template_id="resume-scoring-v3",
        prompt_template_version="3.2.1",
        operator_id="system",
    ),
)

anthropic.messages.create(...)
```

`AsyncAnthropic` / `AsyncOpenAI` work via `audit.wrap_async(...)`. A decorator (`@audit.track(...)`) and context-manager (`audit.case(...)`) surface are also available — see [`python/README.md`](./python/README.md).

Verify with either CLI — the chains interoperate:

```bash
auditlayer verify --storage-dir ./audit-logs --system-id hireflow-resume-screener
# OK Chain valid. N entries verified.
```

---

## Cross-language hash compatibility

For any identical logical input, the TS and Python SDKs produce byte-identical JCS canonical form, SHA-256 entry hash, hash-chain progression, and inline-signer signature. A repo-root conformance suite (`conformance-vectors/`) enforces this on every CI build; any divergence fails the build.

Verified end-to-end in both directions: Python writes 3 entries → TypeScript CLI reports `✔ Chain valid. 3 entries verified.` and the reverse.

---

## Why a separate audit layer

Article 12 logs need properties that observability tools do not provide:

- **Tamper-evidence.** Hash chain + external signing key. An attacker who alters a single record breaks the chain at that point.
- **Regulatory schema.** Model version, prompt template version, input / output fingerprints, operator identity, human review, reason codes — fields a regulator can match against the regulation text.
- **Customer-owned storage.** Logs live in your S3 bucket, not a vendor cloud. Evidentiary value of vendor-hosted logs is weaker in court.
- **GDPR-compatible PII.** Pseudonymize at log time. Token store deletes on request; the audit chain stays intact.

---

## Status

**Alpha.** APIs may change before `v1.0`. What ships today:

- **TypeScript SDK** — `wrap()` for Anthropic + OpenAI, manual `startCall`/`endCall`, local + S3 storage, inline + KMS signer, regex PII with in-memory + SQLite token stores, provider-adapter registry.
- **Python SDK** — full parity with TS: `AuditLogger`, sync + async wrap for Anthropic/OpenAI, `audit.case(...)` context manager, `@audit.track(...)` decorator, local storage, inline signer, regex PII with in-memory + SQLite token stores.
- **CLI** — `init` / `query` / `verify` / `export` in both languages; chains interoperate.
- **Cross-language hash chain** — RFC 8785 + ECMA-262 NumberToString; 16 conformance vectors enforce byte identity on every CI build.
- **Tests** — 136 TypeScript + 77 Python + 16 conformance vectors.

Not yet in MVP:

- LangChain / LangGraph / Agent SDK integration packages
- Hosted SaaS dashboard + auditor portal
- ML-based PII redaction
- SOC 2 Type 1

---

## Examples

| Domain                                    | TypeScript                                                   | Python                                                                         |
| ----------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| HR resume screening (Annex III high-risk) | [`examples/resume-screening`](./examples/resume-screening)   | [`python/examples/resume_screening.py`](./python/examples/resume_screening.py) |
| Fintech credit decision                   | [`examples/credit-decision`](./examples/credit-decision)     | planned                                                                        |
| Healthcare triage                         | [`examples/healthcare-triage`](./examples/healthcare-triage) | planned                                                                        |

Every example reads `AUDIT_SIGNING_KEY` from the environment and fails fast if it's missing — no demo secrets baked in.

---

## Packages

| Path                                           | Name                 | Role                                            |
| ---------------------------------------------- | -------------------- | ----------------------------------------------- |
| [`packages/schema`](./packages/schema)         | `@auditlayer/schema` | Types, Zod validators, JCS, hash chain          |
| [`packages/sdk`](./packages/sdk)               | `@auditlayer/sdk`    | `AuditLogger`, storage backends, PII, providers |
| [`packages/cli`](./packages/cli)               | `@auditlayer/cli`    | `auditlayer` (TypeScript) command               |
| [`python`](./python)                           | `auditlayer`         | Python SDK + `auditlayer` (Python) command      |
| [`conformance-vectors`](./conformance-vectors) | —                    | Cross-language byte-identity test vectors       |

---

## Important disclaimers

AuditLayer is infrastructure. It is **not legal advice**, **not certified** by any Notified Body, and **not a guarantee of admissibility** in any proceeding. Evidentiary value depends on how you operate the chain (key custody, retention configuration, periodic verification).

Full Known Limitations: [`/legal/limitations.md`](./legal/limitations.md).

---

## Development

```bash
# Node side
corepack enable && corepack prepare pnpm@8.15.9 --activate
pnpm install
pnpm build
pnpm test

# Python side
cd python
pip install -e ".[dev]"
pytest
```

## Contributing

PRs welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Security: [`SECURITY.md`](./SECURITY.md). Conduct: [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

## License

[Apache-2.0](./LICENSE). Copyright 2026 AuditLayer Contributors.
