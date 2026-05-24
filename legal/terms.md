# Terms of Service — TEMPLATE (Attorney Review Required)

> **Status:** Draft template for attorney review.
> **Do not** use as binding terms without review by a SaaS-experienced
> attorney licensed in Delaware (governing law) and familiar with EU AI Act
> and GDPR data-processor obligations. The bracketed `[…]` items must be
> filled in by counsel.
>
> **Effective Date:** `[to be filled by counsel]` > **Governing Entity:** VouchRail, Inc., a Delaware corporation
> **Contact:** `legal@vouchrail.com`

## 1. Acceptance

By accessing or using the VouchRail Services (the "Service") or installing
any VouchRail-distributed software ("Software"), Customer agrees to these
Terms of Service. If Customer is entering into these Terms on behalf of an
entity, Customer represents that Customer has the authority to bind that
entity.

## 2. Services

VouchRail provides software and, optionally, hosted services for recording
audit log entries about AI system operation. Customer is solely responsible
for determining whether and how the Service is suitable for Customer's
compliance obligations.

## 3. Customer Compliance Responsibility

Customer is solely responsible for:

(a) determining whether the Service meets Customer's legal and regulatory
requirements, including but not limited to the EU AI Act, GDPR, and any
applicable national law;

(b) maintaining its own backup audit records;

(c) consulting with qualified legal counsel regarding its compliance
obligations;

(d) implementing appropriate redundancy and disaster recovery;

(e) configuring retention periods, PII redaction policies, signing-key
custody, and storage immutability settings.

VouchRail is an infrastructure provider and not a compliance consultancy.

## 4. Audit Trail Evidentiary Disclaimer

Customer acknowledges that audit log evidentiary value in any legal or
regulatory proceeding depends on:

- Proper integration of the Software in Customer's systems;
- Customer's signing-key custody and rotation practices;
- Continuous operation and verification of Customer's infrastructure;
- Periodic chain verification by Customer or its auditors.

The Software's cryptographic mechanisms (SHA-256 hash chain, JCS
canonicalization, external signing) provide tools to support evidence
integrity but do not constitute legal admissibility certification.
VouchRail makes no representation that audit logs produced by the Service
will be accepted as evidence in any particular jurisdiction or proceeding.

## 5. Customer Indemnification

Customer shall indemnify, defend, and hold harmless VouchRail against any
third-party claims arising from Customer's use of the Service in violation
of applicable law, including discrimination, privacy, consumer protection,
or product liability claims by Customer's end users or counterparties.

## 6. Limitation of Liability

To the maximum extent permitted by law, VouchRail's total aggregate
liability arising out of or related to these Terms shall not exceed the
fees paid by Customer to VouchRail in the twelve (12) months preceding
the event giving rise to the claim.

## 7. Exclusion of Consequential Damages

In no event shall VouchRail be liable for any indirect, incidental,
consequential, special, exemplary, or punitive damages, including
without limitation loss of profits, loss of business, loss of data,
**regulatory fines (including EU AI Act and GDPR fines)**, or legal costs
incurred by Customer, even if VouchRail has been advised of the possibility
of such damages.

## 8. Warranty Disclaimer

THE SERVICE AND SOFTWARE ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT
WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
NON-INFRINGEMENT. VOUCHRAIL DOES NOT WARRANT THAT THE SERVICE WILL BE
UNINTERRUPTED, ERROR-FREE, OR BUG-FREE.

## 9. Force Majeure

VouchRail shall not be liable for any failure or delay caused by events
beyond its reasonable control, including acts of nature, war, terrorism,
pandemic, cyber-attacks on upstream infrastructure providers (including
AWS, GCP, Azure, and KMS providers), and government actions.

## 10. Service Modifications

VouchRail may update, modify, or discontinue components of the Service
upon reasonable prior notice. Material breaking changes to the published
audit log schema will be versioned (`schemaVersion`) and migration tooling
will be provided.

## 11. Data Processing

Where VouchRail processes personal data on Customer's behalf in connection
with hosted-service tiers, the parties shall execute the Data Processing
Agreement at `legal/dpa.md` as a separate binding exhibit.

## 12. Survival

Sections 3 through 10, 13, 14, and 15 survive termination of these Terms.

## 13. Notices

Legal notices to VouchRail: `legal@vouchrail.com`.
Legal notices to Customer: the e-mail address on Customer's account, or
the address designated in the relevant order form.

## 14. Independent Parties

The parties are independent contractors. Nothing in these Terms creates an
agency, partnership, joint venture, or fiduciary relationship.

## 15. Entire Agreement; Amendments

These Terms (together with any executed order form and the DPA) constitute
the entire agreement between the parties with respect to the subject matter
and supersede all prior agreements. Amendments require a writing signed by
both parties.

## 16. Severability

If any provision of these Terms is held invalid or unenforceable, the
remaining provisions shall remain in full force and effect.

## 17. Governing Law and Jurisdiction

These Terms are governed by the laws of the State of Delaware, United
States, without regard to its conflict-of-law principles. The parties
consent to the exclusive jurisdiction of the state and federal courts
located in Delaware.

---

### Reviewer checklist

- [ ] Limitation of Liability (12 months fees)
- [ ] Exclusion of consequential / regulatory fine damages
- [ ] "AS IS" warranty disclaimer
- [ ] Customer compliance responsibility
- [ ] Customer indemnification of Provider
- [ ] Force Majeure including upstream infra failures
- [ ] Audit Trail Evidentiary Disclaimer (product-specific)
- [ ] Delaware governing law and jurisdiction
- [ ] Service modification rights with notice
- [ ] DPA referenced as separate exhibit
- [ ] Survival clause
- [ ] Notice requirements
- [ ] No agency / partnership / fiduciary
- [ ] Entire agreement; amendment-in-writing
- [ ] Severability
