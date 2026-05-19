# @auditlayer/sdk

The AuditLayer integration SDK. Wraps existing LLM SDKs and agent
framework calls to produce **tamper-evident audit logs designed to support
EU AI Act Article 12** without forcing application rewrites.

## Install

```bash
pnpm add @auditlayer/sdk
# Optional peer dependencies — install what you use:
pnpm add @anthropic-ai/sdk
pnpm add openai
pnpm add @aws-sdk/client-s3   # only if you want the S3 backend
pnpm add better-sqlite3       # only if you want SQLite-backed pseudonymization
```

## Configure

```ts
import { AuditLogger } from '@auditlayer/sdk';

const audit = new AuditLogger({
  systemId: 'hireflow-resume-screener',
  storage: {
    type: 'local',
    dir: './audit-logs',
  },
  hashChain: { enabled: true, algorithm: 'sha256' },
  signingKey: { kind: 'inline', secret: process.env.AUDIT_SIGNING_KEY! },
  piiRedaction: {
    enabled: true,
    strategy: 'pseudonymize',
    patterns: { email: true, phone: true, ssn: true },
    tokenStore: { type: 'sqlite', path: './audit-logs/pii.sqlite' },
  },
  retention: { minimumDays: 180, targetDays: 2555 },
});
```

## Integration patterns

### Pattern 1 — wrap Anthropic SDK

```ts
import Anthropic from '@anthropic-ai/sdk';

const anthropic = audit.wrap(new Anthropic(), {
  caseId: 'candidate-12345',
  promptTemplateId: 'resume-scoring-v3',
  promptTemplateVersion: '3.2.1',
  operatorId: 'system',
});

const result = await anthropic.messages.create({
  /* … */
});
```

### Pattern 2 — wrap OpenAI SDK

```ts
import OpenAI from 'openai';

const openai = audit.wrap(new OpenAI(), {
  caseId: 'loan-app-9876',
  promptTemplateId: 'credit-scoring-v2',
  promptTemplateVersion: '2.0.0',
  operatorId: 'system',
});

const completion = await openai.chat.completions.create({
  /* … */
});
```

### Pattern 3 — manual `startCall` / `endCall`

```ts
const callId = await audit.startCall({
  caseId: 'candidate-12345',
  modelProvider: 'anthropic',
  modelName: 'claude-3-5-sonnet',
  modelVersion: '20241022',
  promptTemplateId: 'resume-scoring-v3',
  promptTemplateVersion: '3.2.1',
  operatorId: 'system',
  input: { resume: '…' },
});

// run your inference …

await audit.endCall(callId, {
  output: { score: 7.5, recommended: true },
  outputDecision: { score: 7.5, recommended: true },
  reasonCodes: ['EXPERIENCE_MATCH', 'EDUCATION_OK'],
});
```

## Storage backends

- **`local`** — JSONL files under `dir/{systemId}/{YYYY}/{MM}/{DD}/{hour}.jsonl`.
  Good for development and self-hosted on-premise.
- **`s3`** — Same layout in an S3 bucket. Enable Object Lock in Compliance
  mode for true WORM. Encryption recommended via SSE-KMS with customer
  managed keys.

## PII handling

Default strategy is **`pseudonymize`** — PII fields are replaced with
opaque tokens at log time and the token-to-value lookup is stored in a
SEPARATE token store (SQLite by default). This is the pattern described in
spec §5.6 to reconcile EU AI Act Article 12 retention with GDPR erasure.

## Signing keys

The SDK accepts a pluggable `signingKey` configuration. For production,
configure a KMS-backed signer with **sign-only** permission so that the
agent service can never export the key material (spec §5.4).

## Disclaimer

This SDK is infrastructure that supports Article 12 compliance. It does
not provide legal advice and does not guarantee admissibility in any
particular jurisdiction. See [`/legal/limitations.md`](../../legal/limitations.md).

## License

Apache-2.0. See repository root [`LICENSE`](../../LICENSE).
