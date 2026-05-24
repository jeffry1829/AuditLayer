"""Local-filesystem storage backend — Python parity with TS local.ts."""

from __future__ import annotations

import json
import warnings
from collections.abc import Iterable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from ..defaults import STORAGE_DEFAULTS
from ..util import assert_safe_path_segment
from .base import AppendOptions, QueryOptions, StorageBackend


class LocalStorageBackend(StorageBackend):
    """Append entries as JSON Lines under ``dir/systemId/YYYY/MM/DD/HH.jsonl``.

    File rotation granularity is configurable (``hour`` or ``day``); the
    on-disk layout matches the TS backend so a Python writer and TS reader
    (or vice versa) interoperate.
    """

    def __init__(self, dir: str, rotate_by: Literal["hour", "day"] | None = None) -> None:
        self._dir = Path(dir)
        self._rotate_by: Literal["hour", "day"] = rotate_by or STORAGE_DEFAULTS.rotate_by

    def append(self, entry: dict[str, Any], opts: AppendOptions) -> None:
        assert_safe_path_segment(opts.system_id, "systemId")
        started_at: str = entry["startedAt"]
        when = datetime.fromisoformat(started_at.replace("Z", "+00:00")).astimezone(timezone.utc)
        path = self._path_for(opts.system_id, when)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, separators=(",", ":")) + "\n")

    def list(self, opts: QueryOptions) -> Iterable[dict[str, Any]]:
        assert_safe_path_segment(opts.system_id, "systemId")
        system_root = self._dir / opts.system_id
        if not system_root.exists():
            return
        for file in sorted(system_root.rglob(f"*{STORAGE_DEFAULTS.jsonl_extension}")):
            yield from self._read_file(file, opts)

    def _read_file(self, file: Path, opts: QueryOptions) -> Iterable[dict[str, Any]]:
        for line in file.read_text(encoding="utf-8").splitlines():
            trimmed = line.strip()
            if not trimmed:
                continue
            try:
                entry = json.loads(trimmed)
            except json.JSONDecodeError as exc:
                warnings.warn(
                    f"LocalStorageBackend: malformed JSON in {file} — skipping line ({exc})",
                    UserWarning,
                    stacklevel=2,
                )
                continue
            if not isinstance(entry, dict):
                warnings.warn(
                    f"LocalStorageBackend: non-object in {file} — skipping",
                    UserWarning,
                    stacklevel=2,
                )
                continue
            if opts.case_id and entry.get("caseId") != opts.case_id:
                continue
            started: str | None = entry.get("startedAt")
            if opts.from_ and started and started < opts.from_:
                continue
            if opts.to and started and started > opts.to:
                continue
            yield entry

    def _path_for(self, system_id: str, when: datetime) -> Path:
        stem = f"{when.hour:02d}" if self._rotate_by == "hour" else "day"
        name = f"{stem}{STORAGE_DEFAULTS.jsonl_extension}"
        return (
            self._dir
            / system_id
            / f"{when.year:04d}"
            / f"{when.month:02d}"
            / f"{when.day:02d}"
            / name
        )
