# CLI usage

The `vouchrail` command-line tool ships in both TypeScript (`@vouchrail/cli`) and Python (`vouchrail` PyPI package). Both produce identical output for the same chain.

## Install

```bash
# TypeScript — one-shot
pnpm dlx @vouchrail/cli --help

# TypeScript — installed
pnpm add -D @vouchrail/cli
pnpm exec vouchrail --help

# Python
pip install vouchrail
vouchrail --help
```

## Config discovery

Without `--config`, the CLI looks in the current directory for:

1. `vouchrail.config.json`
2. `.vouchrail.json` (fallback)

Schema is described in [Configuration reference](./configuration.md#json-config-file-vouchrailconfigjson). All fields can be overridden by command-line flags:

```
--config <path>          # explicit config file location
--system-id <id>         # override config.systemId
--storage-dir <dir>      # override to local backend pointed at <dir>
--s3-bucket <bucket>     # override to S3 backend
--s3-region <region>
--s3-prefix <prefix>
--json                   # machine-readable output (where supported)
```

## `init`

Writes a starter config file.

```bash
vouchrail init                          # writes vouchrail.config.json
vouchrail init --output config.json     # custom path
vouchrail init --force                  # overwrite existing
```

Exit codes: `0` written; `2` refused to overwrite (without `--force`).

## `query`

Retrieve all entries for a single case.

```bash
vouchrail query --case-id candidate-12345
vouchrail query --case-id candidate-12345 --from 2026-08-01T00:00:00Z --to 2026-09-01T00:00:00Z
vouchrail query --case-id candidate-12345 --json
```

Default output (one entry per line, terse):

```
2026-05-19T12:00:00.000Z 00000000 case=candidate-12345 model=anthropic/claude-3-5-sonnet@20241022 reasons=OK review=approve
```

`--json` switches to one JSON object per line (the full entry).

Exit codes: `0` ok; `2` missing/invalid `--case-id` or bad `--from`/`--to`.

## `verify`

Walk the configured range and recompute the hash chain. **Offline. No VouchRail cloud required.**

```bash
vouchrail verify                                            # all entries
vouchrail verify --from 2026-08-01T00:00:00Z --to ...        # date range
vouchrail verify --case-id candidate-12345                   # one case
vouchrail verify --json                                      # machine-readable
```

Clean chain:

```
✔ Chain valid. 42 entries verified.
```

Tampered chain:

```
✘ Chain INVALID at index 17.
  reason: entry_hash_mismatch
  detail: entry at index 17 (callId=…) has been modified
```

`--json` form:

```json
{
  "systemId": "hireflow-resume-screener",
  "entriesChecked": 42,
  "result": { "valid": true }
}
```

Exit codes: `0` valid; `1` invalid.

## `export`

Emit a JSONL evidence bundle. Either a single case OR a date range is required.

```bash
vouchrail export --case-id candidate-12345 --output bundle.jsonl
vouchrail export --case-id candidate-12345                      # stdout
vouchrail export --from 2026-08-01T00:00:00Z --to 2026-08-31T23:59:59Z --output august.jsonl
```

Exit codes: `0` ok; `1` write failure (e.g., disk full); `2` no filters supplied.

## End-to-end smoke check

```bash
export AUDIT_SIGNING_KEY=a-secret-that-is-long-enough-1234567890
pnpm example:resume                             # writes ./examples/resume-screening/audit-logs
vouchrail verify --storage-dir ./examples/resume-screening/audit-logs \
                 --system-id resume-screener-example
```

You should see `✔ Chain valid.` printed. Tamper one byte in the JSONL and re-run to see the chain break.

## Verifying S3-stored chains offline

```bash
aws s3 sync s3://hireflow-audit-logs/prod/<systemId> ./local-copy
vouchrail verify --storage-dir ./local-copy --system-id <systemId>
```

Pulling the bytes locally keeps verification fully air-gapped from the SDK's hosted services (we don't have any) and from VouchRail itself.
