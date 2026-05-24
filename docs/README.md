# VouchRail docs

Topic-by-topic guides for VouchRail. Each page is short and self-contained.

## Getting started

- [Quickstart](./quickstart.md) — install, wrap an SDK, verify the chain in under five minutes.
- [Architecture](./architecture.md) — how the SDK, schema, storage, and CLI fit together.
- [Configuration reference](./configuration.md) — every field on `AuditLoggerConfig` and the JSON config file.

## Features

- [Providers (Anthropic, OpenAI, custom)](./providers.md) — `wrap()` for raw SDKs, async surface, custom adapter registration.
- [Storage backends](./storage-backends.md) — local filesystem, S3, Object Lock + SSE-KMS, retention.
- [PII redaction](./pii-redaction.md) — patterns, strategies (pseudonymize / hash / remove), token stores, GDPR erasure.
- [Signing keys](./signing-keys.md) — inline (dev), KMS-pluggable (prod), key custody, the dev-only warning.
- [Schema + hash chain](./schema.md) — Article 12 field mapping, JCS canonicalization, chain integrity, schemaVersion.
- [CLI usage](./cli.md) — `init` / `query` / `verify` / `export`, JSON output, config discovery.

## Reference

- [Cross-language conformance](./conformance.md) — what byte-identity means, how the conformance suite gates CI.
- [Examples](../examples/) — HR resume screening, fintech credit, healthcare triage.
- [Legal templates](../legal/) — ToS, privacy, DPA, AUP — attorney review required before use.
- [Known limitations](../legal/limitations.md) — what VouchRail does not do and does not certify.
- [Security policy](../SECURITY.md) — reporting vulnerabilities; scope; safe harbor.
- [Contributing](../CONTRIBUTING.md) — repo layout, lint/test commands, marketing language rules.
