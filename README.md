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

## Documentation

Full docs live under [`docs/`](./docs/).

**Get started**

- [Quickstart](./docs/quickstart.md) — install, wrap an SDK, verify the chain in 5 minutes.
- [Architecture](./docs/architecture.md) — how the SDK, schema, storage, and CLI fit together.
- [Configuration reference](./docs/configuration.md) — every field on `AuditLoggerConfig` and the JSON config file.

**Features**

- [Providers](./docs/providers.md) — Anthropic / OpenAI `wrap()`, async, custom adapter registration, `startCall` / `endCall`.
- [Storage backends](./docs/storage-backends.md) — local + S3, Object Lock, SSE-KMS, retention.
- [PII redaction](./docs/pii-redaction.md) — patterns, pseudonymize / hash / remove, token stores, GDPR erasure.
- [Signing keys](./docs/signing-keys.md) — inline (dev only) and KMS-pluggable (production).
- [Schema + hash chain](./docs/schema.md) — Article 12 field mapping, JCS canonicalization, chain integrity.
- [CLI usage](./docs/cli.md) — `init` / `query` / `verify` / `export`, JSON mode, S3 verify offline.

**Reference**

- [Cross-language conformance](./docs/conformance.md) — byte-identity invariant + how the conformance suite gates CI.
- [Examples](./examples/) — HR resume screening, fintech credit, healthcare triage.
- [Legal templates](./legal/) — ToS, privacy, DPA, AUP — **attorney review required before use**.
- [Known limitations](./legal/limitations.md) — what VouchRail does NOT do and does NOT certify.
- [Security policy](./SECURITY.md) — vulnerability disclosure, scope, safe harbor.
- [Contributing](./CONTRIBUTING.md) — repo layout, commands, marketing-language rules.

## License

[Apache-2.0](./LICENSE). © 2026 VouchRail Contributors.
