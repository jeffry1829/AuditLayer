# Signing keys

Every entry's `entryHash` is signed before persistence. Two signer kinds ship out of the box:

| Kind     | Use case          | Notes                                                                             |
| -------- | ----------------- | --------------------------------------------------------------------------------- |
| `inline` | Dev, tests, demos | HMAC-SHA256 with an in-process secret. Emits a one-time dev-only warning.         |
| `kms`    | Production        | Pluggable — you supply the `sign(entryHashHex)` callback. SDK never sees the key. |

## Inline signer (dev only)

```ts
signingKey: { kind: 'inline', secret: process.env.AUDIT_SIGNING_KEY! }
```

- `secret` must be ≥ 16 characters; shorter throws `VouchRailSignerError(SIGNER_INVALID_SECRET)`.
- Output format: `hmac-sha256:inline:<64-hex>`.
- On construction the signer emits `process.emitWarning(..., { code: 'VOUCHRAIL_INLINE_SIGNER' })` (TypeScript) or `warnings.warn(..., UserWarning)` (Python). The warning fires once per process.
- Suppress in CI / known test contexts: `VOUCHRAIL_SUPPRESS_INLINE_WARNING=1`.

The inline signer ships so you can produce verifiable chains in tests and demos without a KMS. **Do not ship it to production** — the key lives inside the same process that mints audit entries, so a compromised agent can forge signatures.

## KMS-pluggable signer (production)

The SDK doesn't bundle a specific KMS client. You pass a callback that signs a SHA-256 hex digest with whatever KMS / HSM / Vault your environment uses:

```ts
import { KMSClient, SignCommand } from '@aws-sdk/client-kms';

const kms = new KMSClient({ region: 'eu-west-1' });

const audit = new AuditLogger({
  /* ... */
  signingKey: {
    kind: 'kms',
    keyId: 'arn:aws:kms:eu-west-1:123:key/abc',
    sign: async (entryHashHex) => {
      const resp = await kms.send(
        new SignCommand({
          KeyId: 'arn:aws:kms:eu-west-1:123:key/abc',
          Message: Buffer.from(entryHashHex, 'utf8'),
          MessageType: 'RAW',
          SigningAlgorithm: 'ECDSA_SHA_256',
        }),
      );
      return Buffer.from(resp.Signature!).toString('base64');
    },
  },
});
```

The same pattern works for GCP KMS, HashiCorp Vault, Azure Key Vault, or an internal HSM API.

Key custody invariants:

1. The signing key NEVER leaves the KMS. The agent service holds `kms:Sign`, not `kms:GetPublicKey` (audit-side reads can run from a separate role) and certainly not `kms:Decrypt` or export.
2. The KMS role is distinct from the audit-writer role. A compromised audit writer cannot retroactively re-sign altered records.
3. Rotate the key on a schedule; record the key id on the entry via the `Signer.keyId` field so verifiers can look up the right public material.

## Verifying signatures

The `vouchrail verify` CLI checks hash-chain integrity. Signature verification is not part of the chain-walk because verifying a KMS-signed digest requires the KMS public key, which is environment-specific.

For inline-signed chains, the signature format is deterministic (`hmac-sha256:inline:<hex>`); a verifier with the same secret can recompute the HMAC and compare.

For KMS-signed chains, your verification tool calls `kms:Verify` (AWS) or the equivalent. Build this once per environment; the SDK gives you all the inputs (`entryHash` + `signature` + `signer.keyId` per entry).

## Errors

- `SIGNER_INVALID_SECRET` — inline secret shorter than 16 chars.
- `SIGNER_EXTERNAL_INVALID_OUTPUT` — your `sign()` callback returned `''` or a non-string.
- `CONFIG_INVALID` — unknown `signingKey.kind`.

All errors are subclasses of `VouchRailError` and carry stable `code` strings. See [errors.ts](../packages/sdk/src/errors.ts).

## See also

- [Configuration](./configuration.md#signingkey--required)
- [Architecture — defense in depth](./architecture.md)
- [Known limitations — signing key custody is the customer's responsibility](../legal/limitations.md#5-signing-key-custody-is-the-customers-responsibility)
