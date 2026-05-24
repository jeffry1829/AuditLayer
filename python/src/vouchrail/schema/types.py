"""Pydantic models — Python ergonomics for ``AuditLogEntry``.

On-disk JSON stays camelCase (byte-compat with TS SDK); Python
attributes are snake_case via Pydantic's ``alias_generator``. The on-the-wire
contract is owned by ``packages/schema`` (TypeScript) and validated through
the conformance test suite at the repo root.
"""

from __future__ import annotations

import re
from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as _pkg_version
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

SCHEMA_VERSION: Literal["vouchrail-v1.0"] = "vouchrail-v1.0"
SDK_NAME: str = "vouchrail"
# Read from installed-package metadata so SDK_VERSION stays in lockstep with
# pyproject.toml without parsing the file at import time. Mirrors the TS SDK's
# `packages/sdk/src/version.ts` strategy. Falls back to a "0+local" sentinel
# only when the package is not installed (running tests purely from source
# tree without `pip install -e .`); production deployments always install.
try:
    SDK_VERSION: str = _pkg_version(SDK_NAME)
except PackageNotFoundError:
    SDK_VERSION = "0+local"

_SHA256_HEX = re.compile(r"^[0-9a-f]{64}$")
_ISO_DATETIME = re.compile(
    r"^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])"
    r"T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,9})?"
    r"(Z|[+-](0\d|1\d|2[0-3]):[0-5]\d)$"
)

HumanReviewDecision = Literal["approve", "override", "escalate"]

ModelProvider = Literal["anthropic", "openai", "google", "azure", "self_hosted"] | str


class _Strict(BaseModel):
    """Base model: strict field validation, camelCase JSON, immutable instances."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        frozen=True,
    )


class ToolCall(_Strict):
    tool_name: str = Field(min_length=1)
    tool_version: str | None = None
    input_fingerprint: str = Field(pattern=_SHA256_HEX.pattern)
    output_fingerprint: str = Field(pattern=_SHA256_HEX.pattern)
    started_at: str = Field(pattern=_ISO_DATETIME.pattern)
    ended_at: str = Field(pattern=_ISO_DATETIME.pattern)
    error: str | None = None


class HumanReview(_Strict):
    reviewer_id: str = Field(min_length=1)
    reviewed_at: str = Field(pattern=_ISO_DATETIME.pattern)
    decision: HumanReviewDecision
    rationale: str | None = None
    final_decision: Any | None = None


class _PiiRedacted(_Strict):
    fields: list[str]
    pseudonym_key: str | None = None


class AuditLogEntryInput(_Strict):
    """User-supplied fields. Chain layer adds entryHash/previousEntryHash/signature."""

    schema_version: Literal["vouchrail-v1.0"] = SCHEMA_VERSION
    recorded_by: str = Field(min_length=1)

    call_id: str = Field(min_length=1)
    parent_call_id: str | None = None
    case_id: str = Field(min_length=1)
    session_id: str | None = None
    system_id: str = Field(min_length=1)

    started_at: str = Field(pattern=_ISO_DATETIME.pattern)
    ended_at: str = Field(pattern=_ISO_DATETIME.pattern)
    duration_ms: int = Field(ge=0)

    model_provider: str = Field(min_length=1)
    model_name: str = Field(min_length=1)
    model_version: str = Field(min_length=1)
    model_configuration: dict[str, Any] = Field(default_factory=dict)

    prompt_template_id: str = Field(min_length=1)
    prompt_template_version: str = Field(min_length=1)
    prompt_fingerprint: str = Field(pattern=_SHA256_HEX.pattern)

    input_fingerprint: str = Field(pattern=_SHA256_HEX.pattern)
    input_pii_redacted: _PiiRedacted | None = None
    reference_database: str | None = None

    tool_calls: list[ToolCall] | None = None

    output_fingerprint: str = Field(pattern=_SHA256_HEX.pattern)
    output_decision: Any | None = None
    reason_codes: list[str] | None = None

    operator_id: str = Field(min_length=1)
    human_review: HumanReview | None = None

    risk_flags: list[str] | None = None
    incident_id: str | None = None


class AuditLogEntry(AuditLogEntryInput):
    """Full entry including chain metadata + signature."""

    entry_hash: str = Field(pattern=_SHA256_HEX.pattern)
    previous_entry_hash: str = Field(pattern=_SHA256_HEX.pattern)
    signature: str = Field(min_length=1)
