# Configuration reference

Every knob on `AuditLoggerConfig` (TypeScript) / `AuditLogger(...)` (Python) and the JSON config file that the CLI reads.

## TypeScript shape

```ts
import type { AuditLoggerConfig } from '@vouchrail/sdk';

const config: AuditLoggerConfig = {
  systemId: 'hireflow-resume-screener',
  storage: { type: 'local', dir: './audit-logs' },
  signingKey: { kind: 'inline', secret: process.env.AUDIT_SIGNING_KEY! },
  hashChain: { enabled: true, algorithm: 'sha256' },
  retention: { minimumDays: 180, targetDays: 2555 },
  piiRedaction: {
    enabled: true,
    strategy: 'pseudonymize',
    patterns: { email: true, phone: true, ssn: true },
    tokenStore: { type: 'sqlite', path: './audit-logs/pii.sqlite' },
  },
};
```

## Fields

### `systemId` — required string

Stable identifier for the AI system. Becomes a path segment under storage. Must match `/^[A-Za-z0-9._-]+$/` and must not be `.` or `..`.

### `storage` — required

```ts
storage: { type: 'local', dir: string, rotateBy?: 'hour' | 'day' }
storage: {
  type: 's3',
  bucket: string,
  region: string,
  prefix?: string,
  workMode?: boolean,        // intent flag; you still configure Object Lock on the bucket
  endpoint?: string,          // S3-compatible endpoints (MinIO, R2, ...)
  kmsKeyId?: string,          // SSE-KMS key id — recommended in production
}
```

See [Storage backends](./storage-backends.md) for the operational details.

### `signingKey` — required

```ts
signingKey: { kind: 'inline', secret: string }                // dev only
signingKey: {
  kind: 'kms',
  keyId: string,
  sign: (entryHashHex: string) => Promise<string> | string,
}
```

`inline` signers emit a one-time `VOUCHRAIL_INLINE_SIGNER` warning at construction. Set `VOUCHRAIL_SUPPRESS_INLINE_WARNING=1` in CI / known test contexts. Full production guidance in [Signing keys](./signing-keys.md).

### `hashChain` — optional

```ts
hashChain: { enabled: boolean, algorithm: 'sha256' }
```

Defaults to `{ enabled: true, algorithm: 'sha256' }`. Only `sha256` is supported.

### `retention` — optional, informational

```ts
retention: { minimumDays: number, targetDays: number }
```

Recorded on the logger; not enforced by the SDK. Enforcement comes from the storage backend (S3 Object Lock retention period).

### `piiRedaction` — optional

```ts
piiRedaction: {
  enabled: boolean,
  strategy: 'pseudonymize' | 'hash' | 'remove',
  patterns?: Partial<Record<PiiPatternName, boolean>>,
  customPatterns?: Record<string, RegExp>,        // TS API
  tokenStore?: { type: 'memory' } | { type: 'sqlite', path: string },
}
```

Default strategy is `pseudonymize` when enabled. Pseudonymize requires a token store. See [PII redaction](./pii-redaction.md).

## JSON config file (`vouchrail.config.json`)

The CLI reads `./vouchrail.config.json` by default (override with `--config <path>`; fallback `./.vouchrail.json`). The schema is a strict subset of `AuditLoggerConfig` that round-trips through JSON — `signingKey` is supplied separately (env var, KMS lookup) because closures are not serializable.

```json
{
  "systemId": "hireflow-resume-screener",
  "storage": {
    "type": "s3",
    "bucket": "hireflow-audit-logs",
    "region": "eu-west-1",
    "kmsKeyId": "arn:aws:kms:eu-west-1:123:key/abc"
  },
  "retention": { "minimumDays": 180, "targetDays": 2555 },
  "piiRedaction": {
    "enabled": true,
    "strategy": "pseudonymize",
    "patterns": { "email": true, "phone": true },
    "customPatterns": { "ticket": "TICKET-\\d+" },
    "tokenStore": { "type": "sqlite", "path": "./pii.sqlite" }
  }
}
```

`customPatterns` accepts strings here (compiled to a global RegExp at parse time). The programmatic API accepts both strings and pre-built `RegExp` values.

## CLI overrides

Global flags override config-file values:

```
--system-id <id>
--storage-dir <dir>
--s3-bucket <bucket>
--s3-region <region>
--s3-prefix <prefix>
```

See [CLI usage](./cli.md).

## Programmatic typed schema

The schema is exported so callers can validate a config object before constructing the logger:

```ts
import { FileBackedAuditConfigSchema } from '@vouchrail/sdk';

const parsed = FileBackedAuditConfigSchema.parse(JSON.parse(rawJson));
```

Use this when accepting config from an untrusted source.
