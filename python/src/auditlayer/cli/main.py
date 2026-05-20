"""AuditLayer Python CLI — parity with packages/cli (TS).

Commands:

    auditlayer init    --output PATH
    auditlayer query   --case-id ID [--from ISO] [--to ISO] [--json]
    auditlayer verify  [--from ISO] [--to ISO] [--case-id ID] [--json]
    auditlayer export  [--case-id ID] [--from ISO] [--to ISO] [--output PATH]

Storage / systemId can be passed via flags or via an
``auditlayer.config.json`` file in the current working directory.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..defaults import CLI_DEFAULTS
from ..errors import ERROR_CODES, AuditLayerConfigError, AuditLayerSchemaError
from ..schema.hash_chain import verify_chain
from ..storage.base import QueryOptions
from ..storage.local_fs import LocalStorageBackend
from ..util import now_iso  # noqa: F401  (kept for parity with TS CLI's date helpers)

# ----------------------------------------------------------------- config


@dataclass(frozen=True)
class CliConfig:
    system_id: str
    storage_type: str  # "local"
    dir: str | None = None


def _load_config_file(explicit_path: str | None, cwd: Path) -> CliConfig | None:
    candidates: list[Path]
    if explicit_path is not None:
        if ".." in Path(explicit_path).parts:
            raise AuditLayerConfigError(
                ERROR_CODES["CONFIG_INVALID"],
                f"--config must not contain '..' segments (got {explicit_path!r})",
                {"received": explicit_path},
            )
        p = Path(explicit_path)
        candidates = [p if p.is_absolute() else cwd / p]
    else:
        candidates = [cwd / name for name in CLI_DEFAULTS.config_files]
    for path in candidates:
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise AuditLayerConfigError(
                ERROR_CODES["CONFIG_INVALID"],
                f"Failed to read config {path}: {exc}",
                {"path": str(path)},
            ) from exc
        return _parse_config(data, path)
    return None


def _parse_config(raw: Any, path: Path) -> CliConfig:
    if not isinstance(raw, dict):
        raise AuditLayerConfigError(
            ERROR_CODES["CONFIG_INVALID"], f"{path}: config root must be an object", {},
        )
    system_id = raw.get("systemId")
    if not isinstance(system_id, str) or not system_id:
        raise AuditLayerConfigError(
            ERROR_CODES["CONFIG_MISSING_FIELD"],
            f"{path}: systemId is required",
            {"field": "systemId"},
        )
    storage = raw.get("storage")
    if not isinstance(storage, dict):
        raise AuditLayerConfigError(
            ERROR_CODES["CONFIG_MISSING_FIELD"],
            f"{path}: storage is required",
            {"field": "storage"},
        )
    stype = storage.get("type")
    if stype == "local":
        dir_ = storage.get("dir")
        if not isinstance(dir_, str) or not dir_:
            raise AuditLayerConfigError(
                ERROR_CODES["CONFIG_MISSING_FIELD"],
                f"{path}: storage.dir is required for local backend",
                {"field": "storage.dir"},
            )
        return CliConfig(system_id=system_id, storage_type="local", dir=dir_)
    raise AuditLayerConfigError(
        ERROR_CODES["CONFIG_UNKNOWN_BACKEND"],
        f"{path}: storage.type must be 'local' (S3 backend in Python CLI ships later)",
        {"received": stype},
    )


def _resolve_config(args: argparse.Namespace, cwd: Path) -> CliConfig:
    file_cfg = _load_config_file(args.config, cwd)
    system_id = args.system_id or (file_cfg.system_id if file_cfg else None)
    if not system_id:
        raise AuditLayerConfigError(
            ERROR_CODES["CONFIG_MISSING_FIELD"],
            "systemId is required. Set it in auditlayer.config.json or pass --system-id.",
            {"field": "systemId"},
        )
    storage_dir = args.storage_dir or (file_cfg.dir if file_cfg else None)
    if not storage_dir:
        raise AuditLayerConfigError(
            ERROR_CODES["CONFIG_MISSING_FIELD"],
            "storage is required. Configure it or pass --storage-dir.",
            {"field": "storage"},
        )
    return CliConfig(system_id=system_id, storage_type="local", dir=storage_dir)


# ------------------------------------------------------------- helpers


def _validate_iso(value: str | None, label: str) -> None:
    if value is None:
        return
    try:
        from datetime import datetime

        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise AuditLayerSchemaError(
            ERROR_CODES["SCHEMA_INVALID_TIMESTAMP"],
            f"{label} must be an ISO-8601 timestamp (got {value!r})",
            {"label": label, "value": value},
        ) from exc


def _validate_range(from_: str | None, to: str | None) -> None:
    _validate_iso(from_, "--from")
    _validate_iso(to, "--to")
    if from_ and to and from_ > to:
        raise AuditLayerConfigError(
            ERROR_CODES["CONFIG_INVALID"],
            f"--from ({from_}) must not be after --to ({to}).",
            {"from": from_, "to": to},
        )


def _entry_count(n: int) -> str:
    return f"{n} entr{'y' if n == 1 else 'ies'}"


def _format_entry(entry: dict[str, Any]) -> str:
    reasons = (
        f" reasons={','.join(entry['reasonCodes'])}" if entry.get("reasonCodes") else ""
    )
    review = f" review={entry['humanReview']['decision']}" if entry.get("humanReview") else ""
    risk = f" risk={','.join(entry['riskFlags'])}" if entry.get("riskFlags") else ""
    return (
        f"{entry['startedAt']} {entry['callId'][:8]} case={entry['caseId']} "
        f"model={entry['modelProvider']}/{entry['modelName']}@{entry['modelVersion']}"
        f"{reasons}{review}{risk}\n"
    )


# ----------------------------------------------------------- commands


def _cmd_init(args: argparse.Namespace, cwd: Path) -> int:
    out_path = cwd / (args.output or CLI_DEFAULTS.init_output_path)
    if out_path.exists() and not args.force:
        sys.stderr.write(f"Refusing to overwrite {out_path}. Use --force to overwrite.\n")
        return 2
    body = {
        "systemId": "your-system-id",
        "storage": {"type": "local", "dir": "./audit-logs"},
    }
    out_path.write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8")
    sys.stdout.write(f"Wrote config to {out_path}\n")
    return 0


def _backend_for(cfg: CliConfig) -> LocalStorageBackend:
    assert cfg.dir is not None
    return LocalStorageBackend(dir=cfg.dir)


def _cmd_query(args: argparse.Namespace, cwd: Path) -> int:
    if not args.case_id or not args.case_id.strip():
        sys.stderr.write("query: --case-id is required and must be non-empty.\n")
        return 2
    _validate_range(args.from_, args.to)
    cfg = _resolve_config(args, cwd)
    backend = _backend_for(cfg)
    count = 0
    for entry in backend.list(
        QueryOptions(system_id=cfg.system_id, case_id=args.case_id, from_=args.from_, to=args.to),
    ):
        if args.json_output:
            sys.stdout.write(json.dumps(entry) + "\n")
        else:
            sys.stdout.write(_format_entry(entry))
        count += 1
    sys.stderr.write(f"Matched {_entry_count(count)} for case {args.case_id}.\n")
    backend.close()
    return 0


def _cmd_verify(args: argparse.Namespace, cwd: Path) -> int:
    _validate_range(args.from_, args.to)
    cfg = _resolve_config(args, cwd)
    backend = _backend_for(cfg)
    entries = list(
        backend.list(
            QueryOptions(
                system_id=cfg.system_id, case_id=args.case_id, from_=args.from_, to=args.to,
            ),
        ),
    )
    result = verify_chain(entries)
    if args.json_output:
        sys.stdout.write(
            json.dumps(
                {
                    "systemId": cfg.system_id,
                    "entriesChecked": len(entries),
                    "result": {
                        "valid": result.valid,
                        "brokenAt": result.broken_at,
                        "reason": result.reason,
                        "detail": result.detail,
                    },
                },
            )
            + "\n",
        )
    else:
        if result.valid:
            sys.stdout.write(f"OK Chain valid. {_entry_count(len(entries))} verified.\n")
        else:
            sys.stdout.write(f"FAIL Chain INVALID at index {result.broken_at}.\n")
            sys.stdout.write(f"  reason: {result.reason}\n")
            if result.detail:
                sys.stdout.write(f"  detail: {result.detail}\n")
    backend.close()
    return 0 if result.valid else 1


def _cmd_export(args: argparse.Namespace, cwd: Path) -> int:
    if not args.case_id and not args.from_ and not args.to:
        sys.stderr.write("export: pass --case-id or --from/--to to bound the export.\n")
        return 2
    _validate_range(args.from_, args.to)
    cfg = _resolve_config(args, cwd)
    backend = _backend_for(cfg)
    dest = (cwd / args.output).open("w", encoding="utf-8") if args.output else None
    out = dest if dest is not None else sys.stdout
    try:
        count = 0
        for entry in backend.list(
            QueryOptions(
                system_id=cfg.system_id, case_id=args.case_id, from_=args.from_, to=args.to,
            ),
        ):
            out.write(json.dumps(entry) + "\n")
            count += 1
    finally:
        if dest is not None:
            dest.close()
        backend.close()
    sys.stderr.write(f"Wrote {count} entries to {args.output or 'stdout'}\n")
    return 0


# ----------------------------------------------------------- entry point


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="auditlayer",
        description=(
            "AuditLayer Python CLI — query, verify, and export hash-chained audit "
            "logs for EU AI Act Article 12."
        ),
    )
    p.add_argument("--config", dest="config", help="config file path")
    p.add_argument("--system-id", dest="system_id", help="override config systemId")
    p.add_argument("--storage-dir", dest="storage_dir", help="local storage directory")
    p.add_argument("--json", dest="json_output", action="store_true", help="emit JSON")
    sub = p.add_subparsers(dest="command", required=True)

    init = sub.add_parser("init", help="Write a starter auditlayer.config.json")
    init.add_argument("--output", help="output path")
    init.add_argument("--force", action="store_true", help="overwrite existing file")
    init.set_defaults(_fn=_cmd_init)

    query = sub.add_parser("query", help="Retrieve all entries for a case")
    query.add_argument("--case-id", dest="case_id", required=True)
    query.add_argument("--from", dest="from_", help="inclusive lower bound (ISO-8601 UTC)")
    query.add_argument("--to", dest="to", help="inclusive upper bound (ISO-8601 UTC)")
    query.set_defaults(_fn=_cmd_query)

    verify = sub.add_parser("verify", help="Verify the hash chain over the configured range")
    verify.add_argument("--from", dest="from_", help="inclusive lower bound (ISO-8601 UTC)")
    verify.add_argument("--to", dest="to", help="inclusive upper bound (ISO-8601 UTC)")
    verify.add_argument("--case-id", dest="case_id", help="limit verification to a single case")
    verify.set_defaults(_fn=_cmd_verify)

    export = sub.add_parser("export", help="Export an evidence bundle to JSONL")
    export.add_argument("--case-id", dest="case_id")
    export.add_argument("--from", dest="from_")
    export.add_argument("--to", dest="to")
    export.add_argument("--output", help="output file path (defaults to stdout)")
    export.set_defaults(_fn=_cmd_export)

    return p


def main(argv: list[str] | None = None, *, cwd: Path | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    base_cwd = cwd or Path.cwd()
    try:
        return int(args._fn(args, base_cwd))
    except (AuditLayerConfigError, AuditLayerSchemaError) as exc:
        sys.stderr.write(f"auditlayer: {exc}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
