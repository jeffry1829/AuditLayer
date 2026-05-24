# PII redaction

Pseudonymize, hash, or remove PII fields at write time. The audit chain stays intact regardless of which strategy you pick.

## When to enable

If your AI system processes personal data subject to GDPR (or UK GDPR, CCPA, etc.) and Article 12 also obliges you to retain audit records for ≥ 6 months, the two duties collide. The pseudonymize strategy reconciles them:

- The audit log entry stores only opaque tokens (e.g., `pii:7a3c8f...`).
- The token-to-value lookup lives in a SEPARATE token store under your control.
- GDPR erasure deletes from the token store on request; the audit chain is unaffected.

## Configuring

```ts
piiRedaction: {
  enabled: true,
  strategy: 'pseudonymize',
  patterns: { email: true, phone: true, ssn: true },
  customPatterns: { ticket: /TICKET-\d+/g },
  tokenStore: { type: 'sqlite', path: './audit-logs/pii.sqlite' },
}
```

Defaults when `enabled: true`:

- `strategy: 'pseudonymize'`
- `patterns`: every built-in pattern's own `defaultEnabled` flag
- `tokenStore: { type: 'memory' }`

## Strategies

| Strategy       | Replacement                       | Reversible?            | Use case                                  |
| -------------- | --------------------------------- | ---------------------- | ----------------------------------------- |
| `pseudonymize` | `pii:<16-hex>` from a token store | Yes (with token store) | Production. GDPR-erasable.                |
| `hash`         | `pii-h:<sha256-first-16-hex>`     | No                     | Quick wins when you don't need reveal.    |
| `remove`       | `[REDACTED]`                      | No                     | Strictest. Loses field-level fingerprint. |

## Built-in patterns

| Name           | Default enabled | Description                                             |
| -------------- | --------------- | ------------------------------------------------------- |
| `email`        | yes             | RFC 5322 style, bounded                                 |
| `phone`        | yes             | International dial format                               |
| `ssn`          | yes             | US Social Security Number                               |
| `ipAddress`    | yes             | IPv4 dotted-quad                                        |
| `creditCard`   | yes             | 13-19 digits with optional separators                   |
| `iban`         | yes             | ISO 13616                                               |
| `nhsNumber`    | no              | UK NHS Number                                           |
| `euNationalId` | no              | EU national identifier (heuristic)                      |
| `name`         | no              | Capitalized two-token Western personal name (heuristic) |
| `address`      | no              | Numeric-prefixed Western street address (heuristic)     |

Every built-in pattern is bounded in length so adversarial input can't trigger catastrophic backtracking. Custom patterns are your responsibility — see ReDoS notes below.

## Custom patterns

```ts
piiRedaction: {
  enabled: true,
  strategy: 'hash',
  customPatterns: {
    ticketRef: /TICKET-\d{1,12}/g,
    employeeId: /EMP-\d{6,8}/g,
  },
}
```

From a JSON config file the values are strings, compiled to global RegExp at parse time:

```json
{
  "piiRedaction": {
    "enabled": true,
    "strategy": "hash",
    "customPatterns": { "ticketRef": "TICKET-\\d{1,12}" }
  }
}
```

**ReDoS:** Custom regex is not validated for catastrophic backtracking. Bound your quantifiers (`{1,N}` instead of `+`) and avoid nested unbounded alternation.

## Overlapping matches

If two patterns match the same span (e.g. `phone` and `creditCard` both fire on `4111-1111-1111-1111`), the detector keeps the earliest-and-longest match and drops later overlaps. Surrounding text is preserved exactly. The picked-up pattern name lands in `inputPiiRedacted.fields`; the audit log doesn't care which pattern caught a leak — only that it was redacted.

## Token stores

| Store                      | Where it lives                | When to use                                                 |
| -------------------------- | ----------------------------- | ----------------------------------------------------------- |
| `{ type: 'memory' }`       | Process memory only           | Tests, short-lived demos. Lost on restart.                  |
| `{ type: 'sqlite', path }` | SQLite file on disk           | Single-host production. GDPR-erase via `eraseCase(caseId)`. |
| Custom `PiiTokenStore`     | Postgres / Redis / KMS / etc. | Multi-host production. Implement the interface — see below. |

### Custom token store

Implement `PiiTokenStore`:

```ts
import type { PiiTokenStore } from '@vouchrail/sdk';

class PgTokenStore implements PiiTokenStore {
  async getOrCreateToken(caseId, fieldKey, value) {
    /* ... */
  }
  async reveal(token) {
    /* ... */
  }
  async eraseCase(caseId) {
    /* ... */
  }
  async close() {
    /* ... */
  }
}
```

Pass it directly to `AuditLogger`:

```ts
const store = new PgTokenStore(...);
const audit = new AuditLogger({
  /* ... */
  piiRedaction: { enabled: true, strategy: 'pseudonymize' },
});
// Wire the store into the redactor manually if you bypass the config path.
```

## GDPR erasure workflow

```ts
const store = new SqlitePiiTokenStore('./pii.sqlite');
store.eraseCase('candidate-12345');
```

After `eraseCase`:

- All tokens minted for that `caseId` are removed.
- `reveal(token)` returns `null` for those tokens forever.
- The audit chain is unchanged. Hashes still verify. The records show the tokens but the underlying PII is unrecoverable.

This is the [Article 12 × GDPR resolution](../legal/limitations.md#8-article-12--gdpr-resolution-is-a-pattern-not-a-guarantee) pattern; whether a specific regulator accepts it in your jurisdiction is your counsel's call.

## What's NOT covered

- Image / audio / video PII. The SDK redacts strings; binary payloads pass through as fingerprints only.
- ML-based contextual PII (e.g., names without the capitalized-two-token shape). Roadmap item; use custom patterns or pre-redact in the application layer if you need this today.
- PII inside model output. The redactor walks `input` for fingerprinting; `outputDecision` is your structured field — keep PII out of it.

See [Known limitations](../legal/limitations.md#7-pii-redaction-is-regex-based-in-phase-1) for the full disclosure.
