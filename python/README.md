# auditlayer (Python)

Python SDK for **AuditLayer** — EU AI Act Article 12 tamper-evident audit logs.

Cross-language hash compatibility: a TypeScript service and a Python service can
interleave entries in the same hash chain, and either CLI verifies the result
with byte-identical SHA-256 output. Verified end-to-end:

```
# Python writes a chain, TypeScript CLI verifies
python -c "..."                                    # see examples/resume_screening.py
npx @auditlayer/cli verify --system-id <id> --storage-dir <dir>
> ✔ Chain valid. 3 entries verified.

# TypeScript writes a chain, Python CLI verifies
node packages/sdk/dist/index.js ...
auditlayer --system-id <id> --storage-dir <dir> verify
> OK Chain valid. 3 entries verified.
```

## Status

Tier S core SDK + CLI complete; framework adapters (LangChain, LangGraph, etc.)
remain on the roadmap.

| Tier | Item                                                           | Status  |
| ---- | -------------------------------------------------------------- | ------- |
| S1   | Conformance vector test suite (cross-language)                 | Done    |
| S2   | Python schema package (`auditlayer.schema`)                    | Done    |
| S3   | Python core SDK (`AuditLogger`, storage, signer, PII)          | Done    |
| S4   | Python wrap for Anthropic (sync)                               | Done    |
| S5   | Python wrap for OpenAI (sync)                                  | Done    |
| S6   | Python CLI parity (`auditlayer init/query/verify/export`)      | Done    |
| S7   | Python examples (resume-screening; credit + triage planned)    | Partial |
| S8   | PyPI publication                                               | Planned |
| —    | LangChain / LangGraph / etc. integration adapters              | Planned |
| —    | Async wrap (`wrap_async`) for `AsyncAnthropic` / `AsyncOpenAI` | Planned |
| —    | Decorator API (`@audit.track`)                                 | Planned |

## Install

```bash
uv pip install -e ".[dev]"
# or
pip install -e ".[dev]"
```

## Quick start

```python
from auditlayer import AuditLogger, InlineSigner, LocalStorageBackend

audit = AuditLogger(
    system_id="hireflow-resume-screener",
    storage=LocalStorageBackend(dir="./audit-logs"),
    signer=InlineSigner("32-byte-random-secret-or-longer-xxxx"),
)

call_id = audit.start_call(
    case_id="candidate-12345",
    model_provider="anthropic",
    model_name="claude-3-5-sonnet",
    model_version="20241022",
    prompt_template_id="resume-scoring-v3",
    prompt_template_version="3.2.1",
    operator_id="system",
    input={"prompt": "Score this resume..."},
)
audit.end_call(call_id, output_decision={"score": 7.5, "recommended": True})
audit.close()
```

Verify the chain with either CLI:

```bash
auditlayer --system-id hireflow-resume-screener --storage-dir ./audit-logs verify
# OK Chain valid. 1 entries verified.

# Or with the TypeScript CLI — same chain semantics:
npx @auditlayer/cli verify --system-id hireflow-resume-screener --storage-dir ./audit-logs
```

## Hash compatibility invariant

For any identical logical input, TypeScript SDK and Python SDK MUST produce
byte-identical:

1. JCS canonical serialization output (RFC 8785, ECMA-262 NumberToString)
2. Entry hash (SHA-256 of canonical form)
3. Hash chain progression
4. HMAC-SHA256 inline-signer output (`hmac-sha256:inline:<hex>`)

The conformance test suite lives at the repo root under `conformance-vectors/`.
Both SDKs run the same 16+ vectors on every CI build; any divergence fails the
build.

## License

Apache-2.0
