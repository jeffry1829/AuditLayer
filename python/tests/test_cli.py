"""Tests for the Python CLI."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pytest

from auditlayer import AuditLogger, InlineSigner, LocalStorageBackend
from auditlayer.cli.main import main

TEST_SECRET = "test-secret-key-with-enough-length-1234567890"


def _seed(dir_: str, system_id: str = "sys-cli") -> AuditLogger:
    audit = AuditLogger(
        system_id=system_id,
        storage=LocalStorageBackend(dir=dir_),
        signer=InlineSigner(TEST_SECRET),
    )
    for i in range(3):
        cid = audit.start_call(
            case_id=f"case-{i % 2}",
            model_provider="anthropic",
            model_name="claude-3-5-sonnet",
            model_version="20241022",
            prompt_template_id="tpl",
            prompt_template_version="1.0.0",
            operator_id="op",
            input={"i": i},
        )
        audit.end_call(cid, output_decision={"i": i}, reason_codes=["OK"])
    audit.close()
    return audit


@pytest.fixture()
def seeded() -> tuple[str, str]:
    with tempfile.TemporaryDirectory(prefix="auditlayer-cli-") as d:
        _seed(d)
        yield d, "sys-cli"


def test_verify_clean_chain(seeded: tuple[str, str], capsys: pytest.CaptureFixture[str]) -> None:
    dir_, sys_id = seeded
    code = main(["--system-id", sys_id, "--storage-dir", dir_, "verify"])
    captured = capsys.readouterr()
    assert code == 0
    assert "OK Chain valid" in captured.out
    assert "3 entries verified" in captured.out


def test_verify_json(seeded: tuple[str, str], capsys: pytest.CaptureFixture[str]) -> None:
    dir_, sys_id = seeded
    code = main(["--system-id", sys_id, "--storage-dir", dir_, "--json", "verify"])
    captured = capsys.readouterr()
    assert code == 0
    payload = json.loads(captured.out.strip())
    assert payload["systemId"] == sys_id
    assert payload["entriesChecked"] == 3
    assert payload["result"]["valid"] is True


def test_query_filters_by_case(
    seeded: tuple[str, str], capsys: pytest.CaptureFixture[str],
) -> None:
    dir_, sys_id = seeded
    code = main(["--system-id", sys_id, "--storage-dir", dir_, "query", "--case-id", "case-0"])
    captured = capsys.readouterr()
    assert code == 0
    # case-0 receives 2 of 3 entries (i in {0, 2}).
    assert captured.err.count("Matched") == 1
    assert "2 entries" in captured.err


def test_export_requires_a_bound(capsys: pytest.CaptureFixture[str]) -> None:
    with tempfile.TemporaryDirectory(prefix="auditlayer-cli-") as d:
        _seed(d)
        code = main(["--system-id", "sys-cli", "--storage-dir", d, "export"])
        captured = capsys.readouterr()
        assert code == 2
        assert "pass --case-id or --from/--to" in captured.err


def test_export_to_file(seeded: tuple[str, str], capsys: pytest.CaptureFixture[str]) -> None:
    dir_, sys_id = seeded
    with tempfile.TemporaryDirectory(prefix="auditlayer-cli-out-") as out_dir:
        out_path = Path(out_dir) / "evidence.jsonl"
        code = main(
            [
                "--system-id",
                sys_id,
                "--storage-dir",
                dir_,
                "export",
                "--case-id",
                "case-0",
                "--output",
                str(out_path),
            ],
            cwd=Path(out_dir),
        )
        assert code == 0
        lines = out_path.read_text(encoding="utf-8").splitlines()
        assert len(lines) == 2
        for line in lines:
            assert json.loads(line)["caseId"] == "case-0"


def test_init_writes_starter_config(capsys: pytest.CaptureFixture[str]) -> None:
    with tempfile.TemporaryDirectory(prefix="auditlayer-cli-init-") as d:
        cfg_path = Path(d) / "auditlayer.config.json"
        code = main(["init"], cwd=Path(d))
        captured = capsys.readouterr()
        assert code == 0
        assert cfg_path.exists()
        data = json.loads(cfg_path.read_text(encoding="utf-8"))
        assert data["storage"]["type"] == "local"
        assert "Wrote config" in captured.out


def test_init_refuses_to_overwrite(capsys: pytest.CaptureFixture[str]) -> None:
    with tempfile.TemporaryDirectory(prefix="auditlayer-cli-init-") as d:
        cfg_path = Path(d) / "auditlayer.config.json"
        cfg_path.write_text("{}", encoding="utf-8")
        code = main(["init"], cwd=Path(d))
        captured = capsys.readouterr()
        assert code == 2
        assert "Refusing to overwrite" in captured.err


def test_explicit_config_with_traversal_rejected(capsys: pytest.CaptureFixture[str]) -> None:
    with tempfile.TemporaryDirectory(prefix="auditlayer-cli-") as d:
        code = main(["--config", "../escape.json", "verify"], cwd=Path(d))
        captured = capsys.readouterr()
        assert code == 1
        assert "must not contain '..'" in captured.err
