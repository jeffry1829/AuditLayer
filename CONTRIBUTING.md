# Contributing to VouchRail

Thanks for considering a contribution. VouchRail is infrastructure that
ends up in regulated production AI systems, so we hold a few things tightly
and otherwise welcome change.

## Ground rules

1. **The audit log schema is regulated surface area.** Any change to the
   `AuditLogEntry` schema in `packages/schema` requires a schema-version bump
   and a migration note. Do not silently rename or remove fields.
2. **Hash chain semantics are non-negotiable.** Changes to canonicalization,
   hashing algorithm, or signature format MUST be versioned and gated behind
   `schemaVersion`. Old logs must remain verifiable.
3. **No `eval` / `Function()` / dynamic require** in `@vouchrail/sdk`. Logging
   infrastructure is a high-trust component; we keep the surface minimal.
4. **Keep dependencies tight.** Run-time deps in `packages/sdk` are reviewed
   line-by-line. Prefer stdlib + `zod`.

## How to propose a change

1. Open an issue describing the problem, the proposed change, and any
   schema or storage-format impact.
2. For non-trivial changes, wait for maintainer ack before writing a large PR.
3. Fork → branch → PR against `main`.

## Local development

```bash
corepack enable
corepack prepare pnpm@8.15.9 --activate
pnpm install
pnpm build
pnpm test
```

All packages target Node 18.18+. TypeScript strict mode is required.

## Tests

- New runtime behavior MUST have a test in the relevant package's `tests/` folder.
- Hash chain / canonicalization changes MUST include a fixture-based round-trip test.
- Bug fixes MUST include a regression test that fails on `main` and passes on the PR.
- Target coverage on `packages/schema` and `packages/sdk`: `>=85%` lines and statements.

## Commit / PR style

- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- Keep commits self-contained. Don't bundle unrelated changes.
- Reference issues with `Refs #N` or `Closes #N`.

## Marketing / docs discipline

The README, package descriptions, and any public-facing copy
**must not** claim:

- "Guaranteed Article 12 compliant"
- "Certified" (unless we hold an actual certification)
- "Legally admissible in EU courts"
- "Bulletproof" / "100% uptime" / "bug-free" / "court-proven"

Prefer:

- "Designed to support Article 12 compliance"
- "Helps achieve audit-readiness"
- "Framework for tamper-evident logging"

Any PR that introduces a forbidden marketing phrase will be asked to revise.

## Licensing of contributions

By submitting a Contribution, you agree that your Contribution is licensed
under the Apache License 2.0 (see `LICENSE`). Significant Contributors will
be acknowledged in `NOTICE`.

## Security

Do **not** open public issues for security vulnerabilities. See
[`SECURITY.md`](./SECURITY.md) for the private disclosure channel.
