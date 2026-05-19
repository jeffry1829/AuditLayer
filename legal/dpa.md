# Data Processing Agreement (DPA) — TEMPLATE

> **Status:** Draft template per spec §13 / Appendix D Clause 10.
> Must be reviewed by counsel before execution. Defined terms (e.g.,
> "Personal Data", "Processing", "Sub-processor", "Data Subject",
> "Supervisory Authority") have the meanings given in Regulation (EU)
> 2016/679 ("GDPR") and the UK Data Protection Act 2018.

This Data Processing Agreement ("DPA") forms part of the Terms of Service
between AuditLayer, Inc. ("Processor") and Customer ("Controller") and
governs the Processing of Personal Data by Processor on behalf of
Controller in connection with the hosted-service tiers of the AuditLayer
Service.

## 1. Subject matter, duration, nature and purpose

| Item                     | Description                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Subject matter           | Provision of audit-log infrastructure for Controller's AI systems                                               |
| Duration                 | For the duration of the underlying Terms of Service                                                             |
| Nature                   | Storage, retrieval, hash-chain verification, retention enforcement, GDPR-compatible pseudonymization            |
| Purpose                  | Support Controller's compliance with EU AI Act Article 12 and related obligations                               |
| Personal Data categories | As determined by Controller; typically transactional fingerprints, pseudonymized identifiers, decision metadata |
| Data subjects            | As determined by Controller; typically end users of Controller's AI systems                                     |

## 2. Roles

Controller determines the purposes and means of Processing. Processor
processes Personal Data only on documented instructions from Controller,
including with regard to international transfers, unless required by EU,
Member State, or other applicable law.

## 3. Processor obligations

Processor shall:

(a) process Personal Data only on Controller's documented instructions
(including those given through Service configuration);

(b) ensure that persons authorised to process the Personal Data are bound
by confidentiality obligations;

(c) implement appropriate technical and organisational measures (see
Annex II);

(d) respect the conditions for engaging Sub-processors (Section 5);

(e) assist Controller, where reasonably possible, in responding to Data
Subject requests;

(f) assist Controller with security, breach notification, DPIA, and
consultation obligations (Articles 32–36 GDPR);

(g) at Controller's choice, delete or return Personal Data at the end of
the provision of services, subject to the retention obligations
described in Annex III (Article 12 × GDPR resolution);

(h) make available all information necessary to demonstrate compliance and
allow for and contribute to audits, including inspections, conducted
by Controller or another auditor mandated by Controller, with
reasonable notice and during business hours.

## 4. Security measures

See **Annex II — Security Measures**. Includes encryption in transit and
at rest, key management practices, access controls, logging, secure
software development, penetration testing cadence, and incident response.

## 5. Sub-processors

Controller authorises Processor to engage the Sub-processors listed at
[`/legal/sub-processors.md`](./sub-processors.md), subject to the
following:

(a) Processor will provide ≥ 30 days' notice before adding or replacing
Sub-processors and Controller may object on reasonable grounds;

(b) Processor will impose data protection obligations on Sub-processors
equivalent to those in this DPA;

(c) Processor remains liable for Sub-processor performance.

## 6. International transfers

For transfers of Personal Data from the EEA, the UK, or Switzerland to a
country not subject to an adequacy decision, the parties incorporate the
**EU Standard Contractual Clauses (Commission Decision 2021/914), Module
Two (Controller-to-Processor)**, by reference, with the customizations
described in Annex IV. The UK IDTA / Addendum applies for UK transfers.

## 7. Breach notification

Processor will notify Controller without undue delay (target: within 48
hours) after becoming aware of a Personal Data breach affecting Controller
Data, providing the information necessary for Controller's notification
obligations under Articles 33–34 GDPR.

## 8. Audit rights

Controller may audit Processor's compliance with this DPA once per year
on ≥ 30 days' notice, or more frequently if required by a Supervisory
Authority. Processor may satisfy audit requests by providing SOC 2 reports
or equivalent third-party attestations.

## 9. Liability

Liability under this DPA is subject to the limitation of liability clause
in the Terms of Service.

---

## Annex I — Description of Processing

(To be completed per Controller's deployment.)

## Annex II — Security Measures

(See `/legal/security.md` for the current operating-state description.)

## Annex III — Article 12 × GDPR Resolution

The Service implements the pattern described in spec §1.5 and §5.6:
pseudonymize PII at log time, store the token-to-value lookup separately,
support justified reveal workflows for regulator review, support GDPR
erasure of the token store on Controller request. Controller acknowledges
that:

- Audit log content recorded under EU AI Act Article 12 retention
  obligations is retained for the configured retention period.
- GDPR erasure of underlying PII is achieved by deletion of the relevant
  token mapping in Controller's token store, after which the audit log
  remains intact but the PII is no longer recoverable.

## Annex IV — Standard Contractual Clauses Customizations

(To be completed per region and Sub-processor list.)
