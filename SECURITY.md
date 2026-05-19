# Security Policy

AuditLayer is infrastructure that records evidence used in regulatory audits.
Bugs in this software can damage the integrity of customer audit chains and
expose customers to regulatory penalties. We take security reports seriously.

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report privately via:

- **Email**: `security@auditlayer.io` (GPG key fingerprint to be published before v1.0)
- **GitHub Private Vulnerability Reporting**: https://github.com/jeffry1829/AuditLayer/security/advisories/new

Please include:

1. A description of the vulnerability and the affected component(s).
2. A reproduction (proof-of-concept, failing test, or step-by-step).
3. The impact you assess (integrity, confidentiality, availability, evidentiary value).
4. Whether the issue is already public elsewhere.

## What to expect

| Step | Target |
|---|---|
| Acknowledgement of report | within 72 hours |
| Triage and severity assessment | within 7 days |
| Customer notification (if customer-affecting) | within 14 days of confirmation |
| Public disclosure (coordinated) | after fix is shipped and customers are notified |
| Post-mortem | within 7 days of disclosure |

These targets follow the incident response posture described in spec §13.6(D).

## Scope

In scope:

- Vulnerabilities in published `@auditlayer/*` npm packages (latest minor + previous minor).
- Issues that can compromise the integrity, authenticity, or non-repudiation
  of audit log entries (hash chain bypass, signature forgery, canonicalization
  collisions, etc.).
- Issues that leak PII outside the configured redaction / pseudonymization policy.
- Issues in storage backends that defeat WORM / Object Lock guarantees.
- Issues in the CLI's `verify` command that cause false positives or
  false negatives.

Out of scope:

- Hypothetical scenarios that require an attacker who already holds the
  signing key. Signing-key custody is the customer's responsibility (see
  spec §5.4); we recommend KMS-backed keys with sign-only permission.
- Customer misconfiguration (missing Object Lock, retention shorter than
  regulatory minimum, etc.). The CLI and SDK warn about these conditions
  but do not enforce them on the customer's storage.
- Vulnerabilities in customer-side application code that bypass the SDK.

## Safe harbor

Good-faith security research that respects this policy will not result in
legal action from AuditLayer Contributors. Do not run automated scanners
against production AuditLayer infrastructure without prior coordination.

## Hall of fame

Researchers who responsibly disclose meaningful issues will be credited in
the release notes and the project's `SECURITY-HALL-OF-FAME.md` (with
permission).
