# Storage backends

The SDK ships two storage backends: local filesystem (dev / on-prem) and AWS S3 (production). Both produce the same JSONL on-disk layout so a local-to-S3 migration is a copy operation.

## Local filesystem

```ts
{
  type: 'local',
  dir: './audit-logs',
  rotateBy: 'hour' | 'day',   // default 'hour'
}
```

Layout:

```
{dir}/{systemId}/{YYYY}/{MM}/{DD}/{hour}.jsonl     (rotateBy=hour, default)
{dir}/{systemId}/{YYYY}/{MM}/{DD}/day.jsonl        (rotateBy=day)
```

One entry per JSONL line. The append uses `'a'` mode so concurrent writers from one process (serialized by the chain lock) are safe; cross-process concurrent writers on the same file are not supported.

When `list()` encounters malformed JSON or schema-invalid lines it emits a `process.emitWarning` (TS) / `warnings.warn` (Python) with code `VOUCHRAIL_STORAGE_BAD_JSON` or `VOUCHRAIL_STORAGE_BAD_SCHEMA` and continues iterating — a single corrupt line never stops verification.

## S3

```ts
{
  type: 's3',
  bucket: 'hireflow-audit-logs',
  region: 'eu-west-1',
  prefix: 'production',          // optional key prefix
  workMode: true,                 // intent flag; doesn't itself enforce Object Lock
  endpoint: undefined,            // override for S3-compatible services (MinIO, R2)
  kmsKeyId: 'arn:aws:kms:eu-west-1:123:key/abc',
}
```

Layout (one S3 object per entry, so Object Lock retention can be per-entry):

```
{prefix}/{systemId}/{YYYY}/{MM}/{DD}/{hour}-{callId}.json
```

Every PutObject sets `ContentType: application/json` and `ChecksumAlgorithm: SHA256`. When `kmsKeyId` is set, the object also gets `ServerSideEncryption: aws:kms` and the supplied `SSEKMSKeyId`. Omit `kmsKeyId` to inherit the bucket's default encryption.

The TypeScript SDK depends on `@aws-sdk/client-s3` as an optional peer dependency. Install it before constructing an S3 backend or the constructor throws `VouchRailStorageError(STORAGE_BACKEND_MISSING_DEP)`.

S3 backend is TypeScript-only at present; the Python SDK ships local-only.

## Production checklist

For a regulator-defensible chain in S3:

1. **Bucket settings**
   - Object Lock enabled in Compliance mode
   - Versioning enabled
   - Default retention period ≥ your `retention.minimumDays`
   - Default encryption: SSE-KMS with a customer-managed key
   - Block all public access
2. **IAM**
   - The application's role gets `s3:PutObject` + `s3:GetObject` + `s3:ListBucket` for the audit prefix.
   - Object deletion is denied (Object Lock enforces, but defense in depth).
   - `kms:Sign` (or `kms:GenerateDataKey` if applicable) on the KMS key for the signer role, NOT the audit-writer role.
3. **SDK config**
   - Pass `kmsKeyId` matching the bucket default key. Catches drift if someone rotates the bucket default and forgets the application.
   - Use a KMS-backed signer (`signingKey.kind: 'kms'`); the application role must not be able to export the signing key. See [Signing keys](./signing-keys.md).
   - Set `workMode: true` so the field is recorded in entries (informational).

## Verifying S3-stored chains offline

`vouchrail verify` does not require an Internet connection for the local backend. For S3, the simplest pattern is:

```bash
aws s3 sync s3://hireflow-audit-logs/prod/hireflow-resume-screener ./local-copy
vouchrail verify --storage-dir ./local-copy --system-id hireflow-resume-screener
```

This way the verification step is fully offline once the bytes are local.

## Retention

`retention.minimumDays` and `retention.targetDays` are recorded on the logger but the SDK does NOT enforce them. Enforcement is the storage layer's job:

- Local backend: nothing automatic. Operators are responsible for archival.
- S3 backend: configure Object Lock retention on the bucket.

See [Known limitations](../legal/limitations.md) for the operational nuances.
