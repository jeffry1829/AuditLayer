# AuditLayer

**Tamper-evident audit logs for production AI systems. Designed to support EU AI Act Article 12 record-keeping.**

[![CI](https://github.com/jeffry1829/AuditLayer/actions/workflows/ci.yml/badge.svg)](https://github.com/jeffry1829/AuditLayer/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![Status](https://img.shields.io/badge/status-alpha-orange)](#status)

EU AI Act Article 12 takes effect **2 Aug 2026**. Every high-risk AI system
(HR / credit / insurance / healthcare / education) must keep automatic,
reconstructable, tamper-evident logs for ≥ 6 months.

Your existing observability tool (LangSmith / Langfuse / Datadog LLM) is
for engineer debugging. It is not built for regulator audit. AuditLayer
sits alongside it and adds the compliance evidence chain.

---

## Quickstart

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

Verify the chain at any time (offline — no AuditLayer cloud required):

```bash
npx @auditlayer/cli verify --storage-dir ./audit-logs --system-id hireflow-resume-screener
```

---

## What you get

|                |                                                                                     |
| -------------- | ----------------------------------------------------------------------------------- |
| **Schema**     | One JSON record per AI decision. Fields map to Article 12(2)(a)–(c) + 12(3)(a)–(d). |
| **Hash chain** | SHA-256 + RFC 8785 (JCS) canonicalization. Pluggable KMS-backed signer.             |
| **Storage**    | Customer-owned. Local filesystem or S3 (with Object Lock + SSE-KMS).                |
| **PII**        | Regex-based redaction with pseudonymization. Token store is GDPR-deletable.         |
| **CLI**        | `init` / `query` / `verify` / `export`. Verification works fully offline.           |
| **License**    | Apache-2.0. Fork-and-self-host forever.                                             |

Three runnable examples included: [HR resume screening](./examples/resume-screening),
[fintech credit decision](./examples/credit-decision),
[healthcare triage](./examples/healthcare-triage).

---

## Why a separate audit layer

Article 12 logs need properties that observability tools do not provide:

- **Tamper-evidence.** Hash chain + external signing key. An attacker who
  alters a single record breaks the chain at that point.
- **Regulatory schema.** Model version, prompt template version, input /
  output fingerprints, operator identity, human review, reason codes —
  the fields a regulator can match against the regulation text.
- **Customer-owned storage.** Logs live in your S3 bucket, not a vendor
  cloud. Evidentiary value of vendor-hosted logs is weaker in court.
- **GDPR-compatible PII.** Pseudonymize at log time. Token store deletes on
  request; the audit chain stays intact.

---

## Status

**Alpha — Phase 1 MVP.** APIs may change before `v1.0`. What ships today:

- TypeScript SDK with `wrap()` for Anthropic + OpenAI SDKs
- Manual `startCall()` / `endCall()` for custom pipelines
- Local-filesystem and S3 storage backends
- CLI: `init`, `query`, `verify`, `export`
- Hash chain with offline verification
- Regex PII redaction with in-memory + SQLite token stores
- 104 unit tests, schema 96.7% / SDK 91.4% line coverage

Roadmap (not in MVP):

- Python SDK · LangGraph / Agent SDK integrations · hosted SaaS dashboard
- Auditor portal · ML-based PII redaction · SOC 2 Type 1

---

## Important disclaimers

AuditLayer is infrastructure. It is **not legal advice**, **not certified**
by any Notified Body, and **not a guarantee of admissibility** in any
proceeding. Evidentiary value depends on how you operate the chain
(key custody, retention configuration, periodic verification).

Full Known Limitations: [`/legal/limitations.md`](./legal/limitations.md).

---

## Packages

- **[`@auditlayer/schema`](./packages/schema)** — types, Zod validators, JCS, hash chain
- **[`@auditlayer/sdk`](./packages/sdk)** — `AuditLogger`, storage backends, PII redaction
- **[`@auditlayer/cli`](./packages/cli)** — `auditlayer` command

## Development

```bash
corepack enable && corepack prepare pnpm@8.15.9 --activate
pnpm install
pnpm build
pnpm test
```

## Contributing

PRs welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md).
Security: [`SECURITY.md`](./SECURITY.md).
Conduct: [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

## License

[Apache-2.0](./LICENSE). Copyright 2026 AuditLayer Contributors.
