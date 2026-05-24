"""Tests for ``SqlitePiiTokenStore``."""

from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path

import pytest

from vouchrail import PiiRedactor, SqlitePiiTokenStore


@pytest.fixture()
def store_path() -> str:
    with tempfile.TemporaryDirectory(prefix="vouchrail-sqlite-") as d:
        yield str(Path(d) / "pii.sqlite")


def test_creates_schema_on_first_use(store_path: str) -> None:
    store = SqlitePiiTokenStore(store_path)
    try:
        with sqlite3.connect(store_path) as conn:
            tables = {
                r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
            }
        assert "pii_tokens" in tables
    finally:
        store.close()


def test_get_or_create_token_idempotent(store_path: str) -> None:
    store = SqlitePiiTokenStore(store_path)
    try:
        t1 = store.get_or_create_token("case-a", "root.email", "alice@example.com")
        t2 = store.get_or_create_token("case-a", "root.email", "alice@example.com")
        assert t1 == t2
        assert t1.startswith("pii:")
    finally:
        store.close()


def test_distinct_inputs_get_distinct_tokens(store_path: str) -> None:
    store = SqlitePiiTokenStore(store_path)
    try:
        t1 = store.get_or_create_token("case-a", "root.email", "alice@example.com")
        t2 = store.get_or_create_token("case-a", "root.email", "bob@example.com")
        t3 = store.get_or_create_token("case-b", "root.email", "alice@example.com")
        assert len({t1, t2, t3}) == 3
    finally:
        store.close()


def test_reveal_returns_original_value(store_path: str) -> None:
    store = SqlitePiiTokenStore(store_path)
    try:
        token = store.get_or_create_token("case-a", "root.email", "alice@example.com")
        assert store.reveal(token) == "alice@example.com"
        assert store.reveal("pii:nonexistent") is None
    finally:
        store.close()


def test_erase_case_removes_all_tokens(store_path: str) -> None:
    store = SqlitePiiTokenStore(store_path)
    try:
        t1 = store.get_or_create_token("case-a", "root.email", "alice@example.com")
        t2 = store.get_or_create_token("case-a", "root.phone", "+1 555")
        store.get_or_create_token("case-b", "root.email", "bob@example.com")
        store.erase_case("case-a")
        assert store.reveal(t1) is None
        assert store.reveal(t2) is None
        # case-b's tokens are untouched.
        with sqlite3.connect(store_path) as conn:
            row = conn.execute(
                "SELECT COUNT(*) FROM pii_tokens WHERE case_id = ?", ("case-b",),
            ).fetchone()
            assert row[0] == 1
    finally:
        store.close()


def test_redactor_uses_sqlite_store_end_to_end(store_path: str) -> None:
    store = SqlitePiiTokenStore(store_path)
    try:
        redactor = PiiRedactor(
            enabled=True,
            patterns={"email": True, "phone": True},
            token_store=store,
        )
        result = redactor.redact(
            {"resume": "Contact alice@example.com or +1 555 123 4567"},
            case_id="c",
        )
        assert "alice@example.com" not in result.redacted["resume"]
        assert "+1 555 123 4567" not in result.redacted["resume"]
        # The redactor stamps tokens; reveal them via the store.
        tokens = [w for w in result.redacted["resume"].split() if w.startswith("pii:")]
        assert any(store.reveal(t) == "alice@example.com" for t in tokens)
    finally:
        store.close()
