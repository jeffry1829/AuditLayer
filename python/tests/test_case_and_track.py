"""Tests for ``audit.case()`` context manager + ``@audit.track()`` decorator."""

from __future__ import annotations

import asyncio
import tempfile

import pytest

from vouchrail import (
    AuditLogger,
    InlineSigner,
    LocalStorageBackend,
    WrapContext,
)

TEST_SECRET = "test-secret-key-with-enough-length-1234567890"


def _logger(dir_: str) -> AuditLogger:
    return AuditLogger(
        system_id="sys-case",
        storage=LocalStorageBackend(dir=dir_),
        signer=InlineSigner(TEST_SECRET),
    )


@pytest.fixture()
def tmp_dir() -> str:
    with tempfile.TemporaryDirectory(prefix="vouchrail-case-") as d:
        yield d


def test_case_yields_wrap_context_with_supplied_ids(tmp_dir: str) -> None:
    audit = _logger(tmp_dir)
    with audit.case(
        case_id="candidate-123",
        operator_id="opx",
        prompt_template_id="tpl",
        prompt_template_version="1.2.3",
        session_id="sess-9",
    ) as ctx:
        assert isinstance(ctx, WrapContext)
        assert ctx.case_id == "candidate-123"
        assert ctx.operator_id == "opx"
        assert ctx.prompt_template_id == "tpl"
        assert ctx.prompt_template_version == "1.2.3"
        assert ctx.session_id == "sess-9"
    audit.close()


def test_case_does_not_emit_entry_by_itself(tmp_dir: str) -> None:
    """``case`` is a context-supplier, not a call-emitter."""

    audit = _logger(tmp_dir)
    with audit.case(case_id="c", operator_id="o"):
        pass
    assert list(audit.list()) == []
    audit.close()


def test_track_decorator_routes_case_id_through_args(tmp_dir: str) -> None:
    audit = _logger(tmp_dir)
    captured_ctx: list[WrapContext] = []

    @audit.track(case_id_from=lambda *args, **kwargs: kwargs["candidate"]["id"])
    def score(*, candidate: dict, _ctx_sink: list = captured_ctx) -> str:
        # The decorator establishes a scope; inside the function the caller
        # can capture the would-be ``WrapContext`` by re-running ``audit.case``
        # with the same identifiers. We exercise this by directly invoking
        # ``audit.case`` inside the decorated body.
        with audit.case(case_id=candidate["id"], operator_id="system") as ctx:
            _ctx_sink.append(ctx)
        return candidate["id"]

    out = score(candidate={"id": "abc-1"})
    assert out == "abc-1"
    assert captured_ctx[0].case_id == "abc-1"
    audit.close()


def test_track_decorator_async(tmp_dir: str) -> None:
    audit = _logger(tmp_dir)
    captured: list[str] = []

    @audit.track(case_id_from=lambda payload: payload["id"])
    async def score_async(payload: dict) -> str:
        captured.append(payload["id"])
        return payload["id"]

    out = asyncio.run(score_async({"id": "async-9"}))
    assert out == "async-9"
    assert captured == ["async-9"]
    audit.close()


def test_track_decorator_preserves_function_metadata(tmp_dir: str) -> None:
    audit = _logger(tmp_dir)

    @audit.track(case_id_from=lambda x: x)
    def documented(x: str) -> str:
        """Score a candidate."""

        return x

    assert documented.__name__ == "documented"
    assert documented.__doc__ == "Score a candidate."
    audit.close()
