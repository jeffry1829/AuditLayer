# auditlayer (Python)

Python SDK for **AuditLayer** — EU AI Act Article 12 tamper-evident audit logs.

Cross-language hash compatibility: a TypeScript service and a Python service interleave entries in the same hash chain, and either CLI verifies the result with byte-identical SHA-256 output.

```
# Python writes a chain, TypeScript CLI verifies
python examples/resume_screening.py
npx @auditlayer/cli verify --system-id <id> --storage-dir <dir>
> ✔ Chain valid. 3 entries verified.

# TypeScript writes a chain, Python CLI verifies
node packages/cli/dist/bin.js ...
auditlayer --system-id <id> --storage-dir <dir> verify
> OK Chain valid. 3 entries verified.
```

## Install

```bash
pip install auditlayer
# or for development
pip install -e ".[dev]"
```

## Quickstart

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
audit.close()
```

Verify the chain (offline):

```bash
auditlayer --system-id hireflow-resume-screener --storage-dir ./audit-logs verify
# OK Chain valid. N entries verified.
```

## Async

```python
from anthropic import AsyncAnthropic

anthropic = audit.wrap_async(AsyncAnthropic(), ctx)
await anthropic.messages.create(...)
```

`wrap` and `wrap_async` are kept distinct — passing an `AsyncAnthropic` to `wrap()` (or a sync `Anthropic` to `wrap_async()`) raises `AuditLayerProviderError(PROVIDER_UNSUPPORTED_CLIENT)` rather than silently producing broken entries.

## Context manager + decorator

Spec §2.2 patterns 2 and 4:

```python
# Context manager — supplies a WrapContext for a single case
with audit.case(case_id="candidate-12345", operator_id="system") as ctx:
    audit.wrap(Anthropic(), ctx)
    ...

# Decorator — derives the case from function args
@audit.track(case_id_from=lambda candidate: candidate["id"])
def screen(candidate):
    return anthropic.messages.create(...)
```

The decorator handles both `def` and `async def`, preserving `__name__` and `__doc__`.

## PII redaction

```python
from auditlayer import InMemoryPiiTokenStore, PiiRedactor, SqlitePiiTokenStore

store = SqlitePiiTokenStore("./pii.sqlite")  # or InMemoryPiiTokenStore()
audit = AuditLogger(
    system_id=...,
    storage=...,
    signer=...,
    pii_redactor=PiiRedactor(
        enabled=True,
        patterns={"email": True, "phone": True},
        token_store=store,
    ),
    pii_token_store=store,
)
```

`erase_case(case_id)` on the token store deletes every pseudonym for that case — GDPR Article 17 compatible while leaving the hash chain intact.

## Status

| Tier | Item                                                        | Status  |
| ---- | ----------------------------------------------------------- | ------- |
| S1   | Conformance vector test suite (cross-language)              | Done    |
| S2   | Python schema package (`auditlayer.schema`)                 | Done    |
| S3   | Python core SDK (`AuditLogger`, storage, signer, PII)       | Done    |
| S4   | Python wrap for Anthropic (sync + async)                    | Done    |
| S5   | Python wrap for OpenAI (sync + async)                       | Done    |
| S6   | Python CLI parity (`auditlayer init/query/verify/export`)   | Done    |
| S7   | Python examples (resume-screening; credit + triage planned) | Partial |
| —    | `audit.case(...)` context manager                           | Done    |
| —    | `@audit.track(...)` decorator                               | Done    |
| —    | SQLite-backed PII token store                               | Done    |
| S8   | PyPI publication                                            | Planned |
| —    | LangChain / LangGraph / Agent SDK integration packages      | Planned |
| —    | AWS KMS signer                                              | Planned |
| —    | Internal spillover queue for backend failure                | Planned |

## Hash compatibility invariant

For any identical logical input, TypeScript SDK and Python SDK produce byte-identical:

1. JCS canonical serialization (RFC 8785, ECMA-262 NumberToString)
2. Entry hash (SHA-256 of canonical form)
3. Hash chain progression
4. HMAC-SHA256 inline-signer output (`hmac-sha256:inline:<hex>`)

The conformance test suite lives at the repo root under `conformance-vectors/`. Both SDKs run the same 16 vectors on every CI build; any divergence fails the build.

## License

Apache-2.0
