# Known Limitations

> Counter-intuitively, publishing limitations **reduces** legal exposure
> compared to silence.

VouchRail is infrastructure that supports — but does not guarantee — Article 12
compliance and audit-readiness. The following limitations are intentional and
disclosed in good faith.

## 1. Not a legal advisor

VouchRail does not provide legal advice. Determination of whether a particular
AI system is "high-risk" under EU AI Act Annex III, whether Article 12 applies,
and how to operate within applicable law is the responsibility of Customer's
own qualified counsel.

## 2. Not certified by any Notified Body

VouchRail has not been certified by any Notified Body designated under the
EU AI Act, and the Software has not been the subject of conformity assessment
proceedings.

## 3. Not legally admissible per se

Hash-chained, JCS-canonicalized, externally-signed audit log records support
evidence integrity. They do not guarantee admissibility in any specific
jurisdiction or proceeding. Admissibility depends on the operational practices,
key custody, and evidentiary chain maintained by the Customer.

## 4. Retention configuration is the Customer's responsibility

Article 12 deployer retention (Article 26(6): ≥ 6 months) and provider
retention (Article 17 QMS: typically operational lifetime + serious-incident
extension) differ. The Software exposes retention configuration; the Customer
chooses correct values. Misconfigured retention can result in non-compliance
that the Software cannot detect.

## 5. Signing key custody is the Customer's responsibility

A compromised or mis-managed signing key invalidates the cryptographic
integrity of the audit chain. Customers are strongly recommended to configure
the signing key to come from a KMS service (AWS KMS, GCP KMS, HashiCorp Vault)
with sign-only permission. VouchRail cannot detect signing-key compromise.

## 6. WORM / Object Lock requires Customer storage configuration

True write-once-read-many immutability requires that the Customer's storage
backend be configured for Object Lock (or equivalent). The Software warns
when Object Lock is not detected on the S3 backend; it cannot enforce it.

## 7. PII redaction is regex-based in Phase 1

The MVP PII redaction uses configurable regex patterns. It will not catch all
PII in free-text fields. ML-based redaction is on the Phase 3 roadmap.
Customers operating in high-PII-sensitivity contexts (healthcare, criminal
justice) should add custom regex patterns and consider additional pre-redaction
in their application layer.

## 8. Article 12 × GDPR resolution is a pattern, not a guarantee

The Software implements the pseudonymize-with-token-escrow pattern to
reconcile Article 12 retention with GDPR erasure obligations. Whether a
particular regulator (CNIL, ICO, BfDI, etc.) accepts the pattern as
sufficient under both regimes in a particular case is not guaranteed.

## 9. Framework integrations may lag framework releases

LangGraph, Anthropic Agent SDK, OpenAI Agents SDK, and other frameworks evolve
rapidly. Integration packages may temporarily not cover the most recent API
surface of those frameworks. The raw-SDK wraps (Anthropic SDK, OpenAI SDK)
are the stable, framework-agnostic recommendation.

## 10. Schema versioning may require log migration

The audit log schema is versioned (`schemaVersion`). A future major schema
revision may require Customer-side migration of historical logs to remain
verifiable under the latest CLI. Migration tooling will be provided.

## 11. SOC 2 / ISO certifications

In MVP / Phase 1, VouchRail has not completed SOC 2 Type 1, SOC 2 Type 2,
or ISO/IEC 27001 certification. These are roadmap items. The Apache 2.0
open-source Software does not require these certifications to be used
self-hosted by Customer.

## 12. Geographic scope

The Service is operated from the United States (Delaware C-Corp). For EU
Customers, see the Privacy Policy and DPA for region-specific data residency
and transfer arrangements. Multi-region hosted deployments are a roadmap item.

---

If you have questions about any of these limitations, contact
`legal@vouchrail.com`.
