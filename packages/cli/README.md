# @vouchrail/cli

Command-line tool for the VouchRail audit log. Used by engineers and
compliance officers to:

- `init` — write a starter configuration file
- `query` — retrieve all entries for a case
- `verify` — recompute the hash chain and report tamper events
- `export` — emit a JSONL evidence bundle for a case or date range

**Offline by design.** The `verify` command runs entirely against the
configured storage backend; no VouchRail cloud connection is required.

## Install

```bash
pnpm add -D @vouchrail/cli
# or one-shot
pnpm dlx @vouchrail/cli --help
```

## Configuration

By default the CLI reads `./vouchrail.config.json` (override with
`--config <path>`). Example:

```json
{
  "systemId": "hireflow-resume-screener",
  "storage": { "type": "local", "dir": "./audit-logs" }
}
```

For S3:

```json
{
  "systemId": "hireflow-resume-screener",
  "storage": { "type": "s3", "bucket": "hireflow-audit-logs", "region": "eu-west-1" }
}
```

## Commands

```text
vouchrail init [--output vouchrail.config.json]
vouchrail query --case-id <id> [--from <iso>] [--to <iso>]
vouchrail verify [--from <iso>] [--to <iso>] [--case-id <id>]
vouchrail export --case-id <id> [--output <path>]
vouchrail export --from <iso> --to <iso> [--output <path>]
```

Global flags:

- `--config <path>` — config file location
- `--system-id <id>` — override systemId
- `--storage-dir <dir>` — override local storage dir
- `--s3-bucket <bucket>` / `--s3-region <region>` / `--s3-prefix <p>` — override S3
- `--json` — emit machine-readable output

## License

Apache-2.0. See repository root [`LICENSE`](../../LICENSE).
