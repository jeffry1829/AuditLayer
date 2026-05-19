# Security Posture

> Public-facing security policy required by spec §13.6.E and Appendix D.
> This page describes the operating state and roadmap; the **technical
> vulnerability disclosure channel** is at the repo root in
> [`/SECURITY.md`](../SECURITY.md).

## 1. Security principles

- **Customer owns the chain.** AuditLayer's design assumes the customer
  ultimately owns, controls, and verifies its own audit log evidence.
  The Software writes to customer-controlled storage by default
  (spec §5.5).
- **Signing keys live outside the agent.** The signing key for hash-chain
  signatures must be configured to come from a KMS (AWS KMS, GCP KMS,
  HashiCorp Vault) with sign-only permission (spec §5.4). The Software
  exposes a KMS-pluggable interface.
- **Stateless verification.** The `auditlayer verify` CLI operates offline
  and does not depend on AuditLayer's hosted services (spec §13.6.B).
- **Honest disclosure.** Known limitations are public; see
  [`/legal/limitations.md`](./limitations.md).

## 2. Software security practices

| Practice                                                          | Status                         |
| ----------------------------------------------------------------- | ------------------------------ |
| TypeScript strict mode for SDK + Schema                           | Required                       |
| Runtime input validation with Zod                                 | Required for audit log entries |
| No `eval`, `Function()`, dynamic require in `@auditlayer/sdk`     | Required (CONTRIBUTING)        |
| Dependency review on every PR (npm audit, dependabot)             | Configured                     |
| Reproducible builds (lockfile committed; CI uses frozen-lockfile) | Configured                     |
| Tamper-test in `packages/sdk/tests/`                              | Required                       |
| Coverage ≥ 85% on schema + SDK                                    | Enforced in vitest.config.ts   |

## 3. Hosted service security (roadmap; not in MVP)

The hosted-service tiers will operate with:

- SOC 2 Type 1 audit (target: Phase 2, months 5–8)
- TLS 1.2+ for all transport
- SSE-KMS at rest with customer-managed keys
- S3 Object Lock in Compliance mode for hosted buckets
- Quarterly third-party penetration testing
- Annual review of access controls and key rotation policy

## 4. Vulnerability disclosure

See [`/SECURITY.md`](../SECURITY.md).

## 5. Incident response

See [`/legal/incident-response.md`](./incident-response.md).
