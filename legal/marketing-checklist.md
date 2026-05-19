# Marketing Language Audit Checklist

> Internal checklist per spec §13.3 + Appendix D. Apply to every public
> piece of content (README, website, blog, sales emails, conference talks,
> GitHub release notes, partner submissions) before publication.

## Phrases to NEVER use

- [ ] "Guaranteed Article 12 compliant"
- [ ] "Certified" (unless we hold an actual certification — name the body)
- [ ] "Legally admissible in EU courts"
- [ ] "Bulletproof audit trail"
- [ ] "100% uptime"
- [ ] "Bug-free"
- [ ] "Court-proven"
- [ ] "Replaces your compliance officer"
- [ ] "Eliminates regulatory risk"
- [ ] "Anonymizes PII" (we pseudonymize; anonymization is a different and
      stronger claim under GDPR)

## Phrases that are SAFE

- "Designed to support Article 12 compliance"
- "Helps achieve audit-readiness"
- "Framework for tamper-evident logging"
- "Built to satisfy Article 12 technical requirements"
- "Cryptographic integrity tools"
- "Pseudonymizes configured PII fields"

## Other content rules

- [ ] No founder personal guarantees (e.g., "I personally guarantee this will
      pass any audit")
- [ ] No comparison claims about competitor accuracy without published data
- [ ] No customer logos without written permission
- [ ] No claims about specific customer regulatory outcomes ("Klarna passed
      audit using AuditLayer") without customer's written approval
- [ ] All performance numbers cited with the test methodology in a footnote
- [ ] All deadline / penalty references cite the regulation text

## SLA-specific language _(spec §13.4)_

- [ ] **Do not promise**: "audit logs are written within 5 seconds"
      **Do promise**: "audit logs are recorded asynchronously and typically
      available within minutes"
- [ ] **Do not promise**: "99.99% uptime"
      **Do promise**: "monthly availability target of 99.5%; service credits
      available if missed"

## Review trail

Each release / publication that contains marketing claims must have:

- [ ] Author of the copy
- [ ] Reviewer (cross-check against this list)
- [ ] If first content of its type, attorney review (spec §13.3)
- [ ] Date of review
