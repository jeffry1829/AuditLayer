"""Async wrap tests."""

from __future__ import annotations

import tempfile

import pytest

from vouchrail import (
    ERROR_CODES,
    AuditLogger,
    InlineSigner,
    LocalStorageBackend,
    VouchRailProviderError,
    WrapContext,
)

TEST_SECRET = "test-secret-key-with-enough-length-1234567890"


def _logger(dir_: str) -> AuditLogger:
    return AuditLogger(
        system_id="sys-async",
        storage=LocalStorageBackend(dir=dir_),
        signer=InlineSigner(TEST_SECRET),
    )


@pytest.fixture()
def tmp_dir() -> str:
    with tempfile.TemporaryDirectory(prefix="vouchrail-async-") as d:
        yield d


@pytest.mark.asyncio()
async def test_wrap_async_anthropic_records_entry(tmp_dir: str) -> None:
    audit = _logger(tmp_dir)

    class _Messages:
        async def create(self, **params):
            return {
                "id": "msg_async",
                "model": params.get("model"),
                "content": [{"type": "text", "text": "hi"}],
                "usage": {"input_tokens": 5, "output_tokens": 2},
            }

    class _AsyncClient:
        messages = _Messages()

    client = _AsyncClient()
    audit.wrap_async(
        client,
        WrapContext(
            case_id="case-a",
            prompt_template_id="t",
            prompt_template_version="1.0",
            operator_id="op",
        ),
    )
    resp = await client.messages.create(
        model="claude-3-5-sonnet-20241022",
        messages=[{"role": "user", "content": "hi"}],
        temperature=0.3,
    )
    assert resp["id"] == "msg_async"
    entries = list(audit.list())
    assert len(entries) == 1
    assert entries[0]["modelProvider"] == "anthropic"
    assert entries[0]["modelVersion"] == "20241022"
    assert entries[0]["modelConfiguration"] == {"temperature": 0.3}
    audit.close()


@pytest.mark.asyncio()
async def test_wrap_async_openai_records_entry(tmp_dir: str) -> None:
    audit = _logger(tmp_dir)

    class _Completions:
        async def create(self, **params):
            return {
                "id": "cmpl_async",
                "model": params.get("model"),
                "choices": [{"message": {"content": "hi"}}],
                "usage": {"prompt_tokens": 5, "completion_tokens": 2},
            }

    class _Chat:
        completions = _Completions()

    class _AsyncClient:
        chat = _Chat()

    client = _AsyncClient()
    audit.wrap_async(
        client,
        WrapContext(
            case_id="case-o",
            prompt_template_id="t",
            prompt_template_version="1.0",
            operator_id="op",
        ),
    )
    resp = await client.chat.completions.create(
        model="gpt-4o-2024-08-06",
        messages=[{"role": "user", "content": "hi"}],
        max_tokens=64,
    )
    assert resp["id"] == "cmpl_async"
    entries = list(audit.list())
    assert len(entries) == 1
    assert entries[0]["modelProvider"] == "openai"
    assert entries[0]["modelConfiguration"] == {"max_tokens": 64}
    audit.close()


def test_wrap_async_refuses_sync_client(tmp_dir: str) -> None:
    """A sync Anthropic-shaped client is NOT a match for the async path."""

    audit = _logger(tmp_dir)

    class _SyncMessages:
        def create(self, **params):
            return {"id": "x", "content": []}

    class _SyncClient:
        messages = _SyncMessages()

    with pytest.raises(VouchRailProviderError) as exc:
        audit.wrap_async(
            _SyncClient(),
            WrapContext(
                case_id="c",
                prompt_template_id="t",
                prompt_template_version="1.0",
                operator_id="o",
            ),
        )
    assert exc.value.code == ERROR_CODES["PROVIDER_UNSUPPORTED_CLIENT"]
    assert exc.value.context["async"] is True


def test_wrap_refuses_async_client(tmp_dir: str) -> None:
    """And vice versa: an async client is NOT a match for the sync path."""

    audit = _logger(tmp_dir)

    class _AsyncMessages:
        async def create(self, **params):
            return {"id": "x", "content": []}

    class _AsyncClient:
        messages = _AsyncMessages()

    with pytest.raises(VouchRailProviderError) as exc:
        audit.wrap(
            _AsyncClient(),
            WrapContext(
                case_id="c",
                prompt_template_id="t",
                prompt_template_version="1.0",
                operator_id="o",
            ),
        )
    assert exc.value.code == ERROR_CODES["PROVIDER_UNSUPPORTED_CLIENT"]
    assert exc.value.context["async"] is False
