"""Targeted tests for ``LocalStorageBackend`` warning + filtering paths."""

from __future__ import annotations

import json
import shutil
import tempfile
import warnings
from pathlib import Path

import pytest

from vouchrail.storage.base import AppendOptions, QueryOptions
from vouchrail.storage.local_fs import LocalStorageBackend


@pytest.fixture()
def backend_dir() -> str:
    d = tempfile.mkdtemp(prefix="vouchrail-local-")
    try:
        yield d
    finally:
        shutil.rmtree(d, ignore_errors=True)


def _write_entry(backend: LocalStorageBackend, started_at: str, case_id: str) -> None:
    backend.append(
        {
            "schemaVersion": "vouchrail-v1.0",
            "callId": f"call-{case_id}",
            "caseId": case_id,
            "systemId": "sys-local-test",
            "startedAt": started_at,
            "endedAt": started_at,
            "outputDecision": {"ok": True},
        },
        AppendOptions(system_id="sys-local-test"),
    )


def test_list_returns_nothing_when_system_dir_missing(backend_dir: str) -> None:
    backend = LocalStorageBackend(dir=backend_dir)
    out = list(backend.list(QueryOptions(system_id="sys-local-test")))
    assert out == []


def test_list_warns_on_malformed_json(backend_dir: str) -> None:
    backend = LocalStorageBackend(dir=backend_dir)
    _write_entry(backend, "2026-05-19T12:00:00.000Z", "case-1")
    # Hand-poison the JSONL: append a malformed line and a non-object line.
    root = Path(backend_dir) / "sys-local-test" / "2026" / "05" / "19"
    file = next(root.rglob("*.jsonl"))
    with file.open("a", encoding="utf-8") as f:
        f.write("{not valid json\n")
        f.write("42\n")  # valid JSON but not an object
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        entries = list(backend.list(QueryOptions(system_id="sys-local-test")))
    # The clean entry survives; both bad lines are dropped.
    assert len(entries) == 1
    assert entries[0]["caseId"] == "case-1"
    messages = [str(w.message) for w in caught]
    assert any("malformed JSON" in m for m in messages)
    assert any("non-object" in m for m in messages)


def test_list_filters_by_case_and_range(backend_dir: str) -> None:
    backend = LocalStorageBackend(dir=backend_dir)
    _write_entry(backend, "2026-01-01T00:00:00.000Z", "case-A")
    _write_entry(backend, "2026-06-15T12:00:00.000Z", "case-A")
    _write_entry(backend, "2026-06-15T12:00:00.000Z", "case-B")

    a_only = list(
        backend.list(QueryOptions(system_id="sys-local-test", case_id="case-A")),
    )
    assert len(a_only) == 2

    ranged = list(
        backend.list(
            QueryOptions(
                system_id="sys-local-test",
                from_="2026-05-01T00:00:00.000Z",
                to="2026-12-31T00:00:00.000Z",
            ),
        ),
    )
    assert len(ranged) == 2  # the two June entries


def test_rotate_by_day_writes_one_file_per_day(backend_dir: str) -> None:
    backend = LocalStorageBackend(dir=backend_dir, rotate_by="day")
    _write_entry(backend, "2026-05-19T01:00:00.000Z", "case-1")
    _write_entry(backend, "2026-05-19T22:00:00.000Z", "case-2")
    files = sorted(Path(backend_dir).rglob("*.jsonl"))
    assert len(files) == 1
    assert files[0].name == "day.jsonl"
    text = files[0].read_text(encoding="utf-8")
    lines = [line for line in text.splitlines() if line.strip()]
    assert len(lines) == 2
    assert {json.loads(line)["caseId"] for line in lines} == {"case-1", "case-2"}
