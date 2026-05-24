# Incident Response Playbook

> Internal-facing playbook. Documented incident response creates evidence
> of "duty of care" if VouchRail is sued, and is required by most Tech E&O
> insurers.

## Severity definitions

| Severity  | Definition                                              | Examples                                                                     |
| --------- | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **SEV-1** | Active integrity compromise OR data loss                | Hash chain forgery exploit; signing key compromise; multi-Customer data loss |
| **SEV-2** | Service degradation OR single-Customer data exposure    | Hosted-service downtime; PII leak in one tenant; CLI verify false negative   |
| **SEV-3** | Bug or limitation requiring patch but no immediate risk | Schema edge case; CLI UX bug                                                 |
| **SEV-4** | Informational                                           | Roadmap-level findings                                                       |

## Response timeline

| Step                             | Owner                           | Target                                     | Notes                                                           |
| -------------------------------- | ------------------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| Detection                        | on-call / customer / researcher | —                                          | Sources: SECURITY.md inbox, Sentry, Statuspage, customer report |
| Initial assessment               | on-call engineer                | ≤ 1 hour from detection                    | Confirm scope; assign severity                                  |
| Customer notification (affected) | engineering lead                | ≤ 4 hours for SEV-1; ≤ 24 hours for SEV-2  | Email + status page                                             |
| Public status page update        | engineering lead                | ≤ 24 hours for SEV-1/2                     | `status.vouchrail.com`                                          |
| Mitigation deployed              | engineering lead                | ≤ 24 hours for SEV-1; ≤ 72 hours for SEV-2 | Workaround acceptable                                           |
| Permanent fix shipped            | engineering lead                | ≤ 14 days for SEV-1; ≤ 30 days for SEV-2   | Plus regression test                                            |
| Post-mortem published            | engineering lead                | ≤ 7 days after fix                         | Public for SEV-1/2 unless customer requests otherwise           |

## Communication templates

Pre-drafted Customer-notification, status-page, and post-mortem templates
will be added before the first hosted-service customer onboards. Until
then, communications are drafted ad-hoc using the timeline above.

## Audit-chain integrity incidents (special category)

Because VouchRail customers may use audit logs as legal evidence, an incident
that may have compromised hash chain integrity or signature validity requires
**additional steps** beyond ordinary incident response:

1. Identify the affected time window per Customer.
2. Notify Customers explicitly that audit log records produced during the
   affected window may have reduced evidentiary value.
3. Document the technical mechanism of compromise in the post-mortem with
   sufficient detail that Customer's counsel can assess impact.
4. Make the post-mortem and any patched verification tooling permanently
   available (do not unpublish), even for retracted releases.

## Roles

- **Incident Commander**: founder / engineering lead (single DRI per incident)
- **Communications Lead**: same as IC in solo phase; delegated as company grows
- **Customer Liaison**: same as IC in solo phase; delegated as company grows
- **Scribe**: detailed timeline in shared doc; published with the post-mortem

## After-action

Every SEV-1 / SEV-2 incident triggers:

- Public post-mortem (see above)
- Update to test suite (regression test required)
- Update to playbook if process gaps were exposed
- Review of insurance notification obligations (Tech E&O carrier)
