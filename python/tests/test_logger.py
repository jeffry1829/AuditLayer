"""End-to-end tests for the Python AuditLogger."""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from vouchrail import (
    ERROR_CODES,
    AuditLogger,
    InlineSigner,
    InMemoryPiiTokenStore,
    LocalStorageBackend,
    PiiRedactor,
    VouchRailConfigError,
    VouchRailLifecycleError,
    VouchRailProviderError,
    WrapContext,
    register_provider,
    unregister_provider,
    verify_chain,
)

TEST_SECRET = "test-secret-key-with-enough-length-1234567890"


def _make_logger(dir_: str, *, with_pii: bool = False) -> AuditLogger:
    if with_pii:
        store = InMemoryPiiTokenStore()
        return AuditLogger(
            system_id="sys-test",
            storage=LocalStorageBackend(dir=dir_),
            signer=InlineSigner(TEST_SECRET),
            pii_redactor=PiiRedactor(
                enabled=True,
                patterns={"email": True, "phone": True},
                token_store=store,
            ),
            pii_token_store=store,
        )
    return AuditLogger(
        system_id="sys-test",
        storage=LocalStorageBackend(dir=dir_),
        signer=InlineSigner(TEST_SECRET),
    )


@pytest.fixture()
def tmp_audit_dir() -> str:
    with tempfile.TemporaryDirectory(prefix="vouchrail-test-") as d:
        yield d


def test_round_trip_single_entry(tmp_audit_dir: str) -> None:
    audit = _make_logger(tmp_audit_dir)
    call_id = audit.start_call(
        case_id="case-1",
        model_provider="anthropic",
        model_name="claude-3-5-sonnet",
        model_version="20241022",
        prompt_template_id="tpl",
        prompt_template_version="1.0.0",
        operator_id="op",
        input={"hi": True},
    )
    entry = audit.end_call(call_id, output_decision={"ok": True}, reason_codes=["OK"])
    assert entry["callId"] == call_id
    assert entry["signature"].startswith("hmac-sha256:inline:")
    assert entry["outputDecision"] == {"ok": True}
    entries = list(audit.list())
    assert len(entries) == 1
    assert entries[0]["entryHash"] == entry["entryHash"]
    audit.close()


def test_chain_links_across_entries(tmp_audit_dir: str) -> None:
    audit = _make_logger(tmp_audit_dir)
    entries: list[dict] = []
    for i in range(5):
        cid = audit.start_call(
            case_id=f"case-{i}",
            model_provider="openai",
            model_name="gpt-4o",
            model_version="2024-08-06",
            prompt_template_id="tpl",
            prompt_template_version="1.0.0",
            operator_id="op",
            input={"i": i},
        )
        entries.append(audit.end_call(cid, output_decision={"i": i}))
    assert verify_chain(entries).valid is True
    for i in range(1, len(entries)):
        assert entries[i]["previousEntryHash"] == entries[i - 1]["entryHash"]
    audit.close()


def test_pii_redaction_records_pseudonym_fields(tmp_audit_dir: str) -> None:
    audit = _make_logger(tmp_audit_dir, with_pii=True)
    cid = audit.start_call(
        case_id="case-pii",
        model_provider="anthropic",
        model_name="claude-3-5-sonnet",
        model_version="20241022",
        prompt_template_id="tpl",
        prompt_template_version="1.0",
        operator_id="op",
        input={"resume": "Contact alice@example.com or +1 555 123 4567"},
    )
    entry = audit.end_call(cid, output_decision={"ok": True})
    assert entry["inputPiiRedacted"] is not None
    fields = entry["inputPiiRedacted"]["fields"]
    assert any("email" in f for f in fields)
    assert entry["inputPiiRedacted"]["pseudonymKey"] == "case-pii"
    audit.close()


def test_end_call_unknown_id_raises_lifecycle_error(tmp_audit_dir: str) -> None:
    audit = _make_logger(tmp_audit_dir)
    with pytest.raises(VouchRailLifecycleError) as exc:
        audit.end_call("nonexistent", output_decision={"x": 1})
    assert exc.value.code == ERROR_CODES["LOGGER_CALL_NOT_PENDING"]
    audit.close()


def test_empty_system_id_rejected() -> None:
    with pytest.raises(VouchRailConfigError) as exc:
        AuditLogger(
            system_id="",
            storage=LocalStorageBackend(dir="/tmp/never"),
            signer=InlineSigner(TEST_SECRET),
        )
    assert exc.value.code == ERROR_CODES["CONFIG_MISSING_FIELD"]


def test_path_traversal_system_id_rejected() -> None:
    with pytest.raises(VouchRailConfigError) as exc:
        AuditLogger(
            system_id="../escape",
            storage=LocalStorageBackend(dir="/tmp/never"),
            signer=InlineSigner(TEST_SECRET),
        )
    assert exc.value.code == ERROR_CODES["LOGGER_PATH_SEGMENT_UNSAFE"]


def test_wrap_unsupported_client_raises_provider_error(tmp_audit_dir: str) -> None:
    audit = _make_logger(tmp_audit_dir)
    with pytest.raises(VouchRailProviderError) as exc:
        audit.wrap(
            object(),
            WrapContext(
                case_id="c",
                prompt_template_id="t",
                prompt_template_version="1.0",
                operator_id="o",
            ),
        )
    assert exc.value.code == ERROR_CODES["PROVIDER_UNSUPPORTED_CLIENT"]


def test_wrap_anthropic_mock_records_entry(tmp_audit_dir: str) -> None:
    audit = _make_logger(tmp_audit_dir)

    class _Messages:
        def create(self, **params):
            return {
                "id": "msg_xyz",
                "model": params.get("model"),
                "content": [{"type": "text", "text": "hi"}],
                "usage": {"input_tokens": 10, "output_tokens": 5},
            }

    class _Client:
        messages = _Messages()

    client = _Client()
    audit.wrap(
        client,
        WrapContext(
            case_id="case-anth",
            prompt_template_id="tpl-a",
            prompt_template_version="1.0",
            operator_id="op",
        ),
    )
    resp = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        messages=[{"role": "user", "content": "hi"}],
        temperature=0.2,
        max_tokens=64,
    )
    assert resp["id"] == "msg_xyz"
    entries = list(audit.list())
    assert len(entries) == 1
    assert entries[0]["modelProvider"] == "anthropic"
    assert entries[0]["modelVersion"] == "20241022"
    assert entries[0]["modelConfiguration"] == {"temperature": 0.2, "max_tokens": 64}
    audit.close()


def test_custom_provider_registration(tmp_audit_dir: str) -> None:
    audit = _make_logger(tmp_audit_dir)

    class _CustomAdapter:
        provider_id = "self_hosted"

        def detect(self, client):
            return getattr(client, "_marker", False) is True

        def wrap(self, audit_, client, context):
            original = client.run

            def wrapped(*a, **kw):
                cid = audit_.start_call(
                    case_id=context.case_id,
                    model_provider="self_hosted",
                    model_name="mocky",
                    model_version="v1",
                    prompt_template_id=context.prompt_template_id,
                    prompt_template_version=context.prompt_template_version,
                    operator_id=context.operator_id,
                )
                resp = original(*a, **kw)
                audit_.end_call(cid, output=resp)
                return resp

            client.run = wrapped

    class _Marked:
        _marker = True

        def run(self):
            return "ok"

    register_provider(_CustomAdapter())
    try:
        client = _Marked()
        audit.wrap(
            client,
            WrapContext(
                case_id="c",
                prompt_template_id="t",
                prompt_template_version="1.0",
                operator_id="o",
            ),
        )
        assert client.run() == "ok"
        assert len(list(audit.list())) == 1
    finally:
        unregister_provider("self_hosted")
    audit.close()


def test_tamper_detection(tmp_audit_dir: str) -> None:
    audit = _make_logger(tmp_audit_dir)
    for i in range(3):
        cid = audit.start_call(
            case_id=f"case-{i}",
            model_provider="anthropic",
            model_name="m",
            model_version="v",
            prompt_template_id="t",
            prompt_template_version="1.0",
            operator_id="o",
        )
        audit.end_call(cid, output_decision={"i": i})
    audit.close()

    # Tamper with entry 1 on disk.
    files = sorted(Path(tmp_audit_dir).rglob("*.jsonl"))
    assert len(files) >= 1
    lines = files[0].read_text(encoding="utf-8").splitlines()
    import json as _json

    parsed = _json.loads(lines[1])
    parsed["outputDecision"] = {"tampered": True}
    lines[1] = _json.dumps(parsed)
    files[0].write_text("\n".join(lines) + "\n", encoding="utf-8")

    backend = LocalStorageBackend(dir=tmp_audit_dir)
    entries = list(
        backend.list(__import__("vouchrail").storage.base.QueryOptions(system_id="sys-test")),
    )
    result = verify_chain(entries)
    assert result.valid is False
    assert result.broken_at == 1
    assert result.reason == "entry_hash_mismatch"
