<p align="center">
  <img src="./assets/banner.png" alt="VouchRail" width="480">
</p>

<p align="center">
  Tamper-evident audit logs for AI systems. Hash-chained, signed, customer-owned. TypeScript + Python, one chain.
</p>

<p align="center">
  <a href="https://github.com/jeffry1829/VouchRail/actions/workflows/ci.yml"><img src="https://github.com/jeffry1829/VouchRail/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License"></a>
</p>

---

EU AI Act Article 12 kicks in 2 Aug 2026. Every high-risk AI system (HR, credit, insurance, healthcare, education) has to keep reconstructable, tamper-evident logs for 6+ months. Observability tools (Langfuse, Datadog LLM, LangSmith) are built for debugging your model, not for regulators. VouchRail sits next to them and writes the evidence chain.

## Install

```bash
pnpm add @vouchrail/sdk      # TypeScript
pip  install vouchrail       # Python
```

## Use

```ts
import Anthropic from '@anthropic-ai/sdk';
import { AuditLogger } from '@vouchrail/sdk';

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

```python
import os
from anthropic import Anthropic
from vouchrail import AuditLogger, InlineSigner, LocalStorageBackend, WrapContext

audit = AuditLogger(
    system_id="hireflow-resume-screener",
    storage=LocalStorageBackend(dir="./audit-logs"),
    signer=InlineSigner(os.environ["AUDIT_SIGNING_KEY"]),
)

anthropic = audit.wrap(Anthropic(), WrapContext(
    case_id="candidate-12345",
    prompt_template_id="resume-scoring-v3",
    prompt_template_version="3.2.1",
    operator_id="system",
))

anthropic.messages.create(...)
```

Async clients: `audit.wrap_async(...)`. Decorator + context-manager surface: [`python/README.md`](./python/README.md).

## Verify

Offline. No VouchRail cloud, no network.

```bash
vouchrail verify --storage-dir ./audit-logs --system-id hireflow-resume-screener
# ✔ Chain valid. N entries verified.
```

TS and Python write byte-identical chains — either CLI verifies either SDK's output. 16 conformance vectors in CI enforce it.

## Docs

Full guides live in [`docs/`](./docs/):

- [Quickstart](./docs/quickstart.md) · [Architecture](./docs/architecture.md) · [Configuration reference](./docs/configuration.md)
- [Providers](./docs/providers.md) · [Storage backends](./docs/storage-backends.md) · [PII redaction](./docs/pii-redaction.md) · [Signing keys](./docs/signing-keys.md)
- [Schema + hash chain](./docs/schema.md) · [CLI usage](./docs/cli.md) · [Cross-language conformance](./docs/conformance.md)

## Why not just my observability tool

Four things observability stacks don't give you:

- **Tamper-evidence.** SHA-256 chain + external signing key. One altered record breaks the chain at that point — and you can prove which.
- **Regulator-shaped schema.** Model + prompt versions, input/output fingerprints, operator, human review, reason codes — fields a regulator can match to the regulation text.
- **Your storage.** Logs land in your S3 (or local disk). Vendor-hosted logs carry weaker evidentiary weight in court.
- **GDPR-safe PII.** Pseudonymize at write time; token store is deletable on request; the chain stays intact.

## Status

Alpha. APIs may shift before `v1.0`. Working today:

- TS + Python SDKs at parity — `wrap()`, manual `startCall`/`endCall`, local + S3 storage (TS) / local (Python), inline + KMS signer, regex PII with in-memory + SQLite token stores.
- CLI in both languages: `init` / `query` / `verify` / `export`.
- Cross-language hash chain (RFC 8785 JCS + ECMA-262 NumberToString). 16 conformance vectors gate every build.

Not yet: LangChain / LangGraph adapters, hosted dashboard, ML-based PII, SOC 2.

## Layout

- `packages/schema` — types, JCS, hash chain
- `packages/sdk` — `AuditLogger`, storage, PII, providers
- `packages/cli` — TS CLI
- `python/` — Python SDK + CLI
- `examples/` — HR screening, credit, healthcare triage
- `conformance-vectors/` — cross-language byte-identity tests
- `docs/` — topical guides (see above)
- `legal/` — ToS, privacy, DPA, AUP **templates** (attorney review required before use)

## Limits

Infrastructure, not legal advice. Not certified by any Notified Body. Evidentiary value depends on key custody, retention configuration, and periodic verification — see [`legal/limitations.md`](./legal/limitations.md).

## Dev

```bash
# Node
corepack enable && corepack prepare pnpm@8.15.9 --activate
pnpm install && pnpm build && pnpm test

# Python
cd python && pip install -e ".[dev]" && pytest
```

Contributing: [`CONTRIBUTING.md`](./CONTRIBUTING.md). Security: [`SECURITY.md`](./SECURITY.md). Conduct: [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

## License

[Apache-2.0](./LICENSE). © 2026 VouchRail Contributors.
