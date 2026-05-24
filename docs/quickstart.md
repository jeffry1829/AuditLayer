# Quickstart

Five minutes from `npm install` to a verified hash chain.

## Install

```bash
pnpm add @vouchrail/sdk      # TypeScript
pip  install vouchrail       # Python
```

Optional peer dependencies — install only what you wrap:

| Need                   | TypeScript           | Python                     |
| ---------------------- | -------------------- | -------------------------- |
| Anthropic provider     | `@anthropic-ai/sdk`  | `anthropic`                |
| OpenAI provider        | `openai`             | `openai`                   |
| S3 storage backend     | `@aws-sdk/client-s3` | `boto3` (planned)          |
| SQLite PII token store | `better-sqlite3`     | stdlib (no install needed) |

## Wrap a provider — TypeScript

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
  model: 'claude-3-5-sonnet-20241022',
  messages: [{ role: 'user', content: 'Score this resume...' }],
  max_tokens: 256,
});

await audit.close();
```

`AUDIT_SIGNING_KEY` must be at least 16 characters. The inline signer is dev-only; see [Signing keys](./signing-keys.md) for production.

## Wrap a provider — Python

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

anthropic.messages.create(
    model="claude-3-5-sonnet-20241022",
    messages=[{"role": "user", "content": "Score this resume..."}],
    max_tokens=256,
)

audit.close()
```

`AsyncAnthropic` / `AsyncOpenAI`: use `audit.wrap_async(...)`. Context-manager and `@audit.track(...)` decorator forms are in [Providers](./providers.md).

## Verify the chain — offline, either CLI

```bash
# TypeScript CLI
npx @vouchrail/cli verify --storage-dir ./audit-logs --system-id hireflow-resume-screener

# Python CLI (after pip install vouchrail)
vouchrail verify --storage-dir ./audit-logs --system-id hireflow-resume-screener
```

Output (clean chain):

```
✔ Chain valid. 1 entry verified.
```

TS and Python write byte-identical chains. Either CLI verifies either SDK's output. 16 conformance vectors gate every build — see [Cross-language conformance](./conformance.md).

## Next steps

- [Storage backends](./storage-backends.md) for S3 + Object Lock + SSE-KMS in production.
- [PII redaction](./pii-redaction.md) for pseudonymization with a deletable token store.
- [Signing keys](./signing-keys.md) for KMS-backed signing (mandatory in production).
- [Examples](../examples/) for full HR, credit, and healthcare scenarios.
