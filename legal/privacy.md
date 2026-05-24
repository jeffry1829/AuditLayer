# Privacy Policy — TEMPLATE (Attorney Review Required)

> **Status:** Draft template for attorney review.
> **Do not** use as binding policy without review by counsel familiar with
> GDPR (EU), UK GDPR, CCPA/CPRA (California), and applicable APAC privacy law.

**Effective Date:** `[to be filled by counsel]`
**Controller for this site:** VouchRail, Inc., Delaware, USA.
**EU Representative:** `[to be appointed under GDPR Art. 27 when required]`
**Contact:** `privacy@vouchrail.com`

## 1. Scope

This policy covers personal data collected by VouchRail when individuals
visit the public website, sign up for accounts, contact us, or use the
hosted-service tiers of the Service.

When a Customer uses VouchRail's Software or hosted Service to record
audit logs about Customer's own AI system operation, **Customer is the
data controller** for any personal data in those logs and VouchRail acts
as a **data processor** subject to the Data Processing Agreement at
[`/legal/dpa.md`](./dpa.md).

## 2. Categories of personal data we process

| Category  | Examples                    | Purpose                    | Legal basis (GDPR)                  |
| --------- | --------------------------- | -------------------------- | ----------------------------------- |
| Identity  | name, email, employer       | Account creation, billing  | Contract (Art. 6(1)(b))             |
| Technical | IP address, browser, device | Security, abuse prevention | Legitimate interests (Art. 6(1)(f)) |
| Usage     | page views, feature use     | Product improvement        | Legitimate interests                |
| Payment   | last 4 digits, country      | Billing                    | Contract                            |
| Support   | message content             | Customer support           | Contract                            |

We do **not** sell personal data and do not engage in cross-context
behavioral advertising.

## 3. Cookies and similar technologies

The website uses a small number of strictly necessary cookies for session
management. We do not use third-party advertising cookies. Analytics, when
present, are privacy-respecting (server-side or anonymized at collection).

## 4. Where data is stored and transferred

Operational data is stored in `[AWS region(s) to be specified by counsel]`.
For hosted-service Customers, audit log content is stored in the Customer's
chosen region. Transfers outside the EEA / UK rely on the EU Standard
Contractual Clauses (2021/914) and the UK IDTA where applicable.

## 5. Retention

| Data              | Retention                                                      |
| ----------------- | -------------------------------------------------------------- |
| Account data      | Lifetime of account + 12 months                                |
| Billing records   | 7 years (tax / accounting)                                     |
| Support tickets   | 24 months                                                      |
| Web logs          | 90 days                                                        |
| Hosted audit logs | Per Customer's configured policy (Software default: ≥180 days) |

## 6. Your rights (GDPR, UK GDPR)

Subject to applicable law, you have the right to:

- access personal data we hold about you,
- rectify inaccurate personal data,
- request erasure ("right to be forgotten"),
- restrict or object to processing,
- portability of personal data you provided,
- withdraw consent where processing is based on consent,
- lodge a complaint with your supervisory authority (e.g., CNIL in France,
  ICO in the UK, BfDI in Germany).

For audit-log content recorded by the Software, exercise these rights with
the **Customer** that operates the AI system, not VouchRail; VouchRail
will forward applicable requests under the DPA.

## 7. Article 12 × GDPR interaction

The VouchRail Software is designed to support the simultaneous obligations
of EU AI Act Article 12 (retention of audit records ≥ 6 months) and GDPR
(deletion of personal data when no longer necessary; right of erasure).
The Software achieves this by pseudonymizing personal data fields at log
time and storing the token-to-value lookup in a separate, GDPR-deletable
store under Customer control. VouchRail makes no representation that this
mechanism is sufficient on its own; Customer must operate the token store
and erasure workflow according to its DPA and applicable law.

## 8. Security

See [`/legal/security.md`](./security.md) for our security posture.

## 9. Changes

We may update this policy from time to time. Material changes will be
announced on the website and, for hosted-service Customers, via email.

## 10. Contact

- Privacy questions: `privacy@vouchrail.com`
- Data subject requests: `privacy@vouchrail.com`
- Legal notices: `legal@vouchrail.com`
