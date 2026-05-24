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
from typing import Annotated, Any, Literal

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

# Shared annotated string types so each hash-hex / ISO field doesn't restate
# the regex. The ``Annotated[str, Field(...)]`` form is the canonical way to
# attach validation constraints to a reusable type in Pydantic v2.
Sha256Hex = Annotated[str, Field(pattern=_SHA256_HEX.pattern)]
IsoDateTime = Annotated[str, Field(pattern=_ISO_DATETIME.pattern)]
NonEmptyStr = Annotated[str, Field(min_length=1)]

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
    tool_name: NonEmptyStr
    tool_version: str | None = None
    input_fingerprint: Sha256Hex
    output_fingerprint: Sha256Hex
    started_at: IsoDateTime
    ended_at: IsoDateTime
    error: str | None = None


class HumanReview(_Strict):
    reviewer_id: NonEmptyStr
    reviewed_at: IsoDateTime
    decision: HumanReviewDecision
    rationale: str | None = None
    final_decision: Any | None = None


class _PiiRedacted(_Strict):
    fields: list[str]
    pseudonym_key: str | None = None


class AuditLogEntryInput(_Strict):
    """User-supplied fields. Chain layer adds entryHash/previousEntryHash/signature."""

    schema_version: Literal["vouchrail-v1.0"] = SCHEMA_VERSION
    recorded_by: NonEmptyStr

    call_id: NonEmptyStr
    parent_call_id: str | None = None
    case_id: NonEmptyStr
    session_id: str | None = None
    system_id: NonEmptyStr

    started_at: IsoDateTime
    ended_at: IsoDateTime
    duration_ms: int = Field(ge=0)

    model_provider: NonEmptyStr
    model_name: NonEmptyStr
    model_version: NonEmptyStr
    model_configuration: dict[str, Any] = Field(default_factory=dict)

    prompt_template_id: NonEmptyStr
    prompt_template_version: NonEmptyStr
    prompt_fingerprint: Sha256Hex

    input_fingerprint: Sha256Hex
    input_pii_redacted: _PiiRedacted | None = None
    reference_database: str | None = None

    tool_calls: list[ToolCall] | None = None

    output_fingerprint: Sha256Hex
    output_decision: Any | None = None
    reason_codes: list[str] | None = None

    operator_id: NonEmptyStr
    human_review: HumanReview | None = None

    risk_flags: list[str] | None = None
    incident_id: str | None = None


class AuditLogEntry(AuditLogEntryInput):
    """Full entry including chain metadata + signature."""

    entry_hash: Sha256Hex
    previous_entry_hash: Sha256Hex
    signature: NonEmptyStr
