"""AuditLogger — main Python entry point. Mirrors ``packages/sdk/src/audit-logger.ts``."""

from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Any

from .defaults import RETENTION_DEFAULTS
from .errors import (
    ERROR_CODES,
    AuditLayerConfigError,
    AuditLayerLifecycleError,
    AuditLayerSchemaError,
)
from .pii.redactor import PiiRedactor
from .pii.token_store import PiiTokenStore
from .providers.base import ProviderHostLogger, WrapContext
from .providers.registry import wrap_client, wrap_client_async
from .schema.hash_chain import compute_entry_hash, link_entry
from .schema.types import SCHEMA_VERSION, SDK_NAME, SDK_VERSION
from .signers.base import Signer
from .storage.base import AppendOptions, QueryOptions, StorageBackend
from .util import (
    assert_safe_path_segment,
    derive_duration_ms,
    fingerprint,
    now_iso,
    uuid_v4,
)

RECORDED_BY = f"{SDK_NAME}@{SDK_VERSION}"


@dataclass
class _PendingCall:
    call_id: str
    started_at: str
    case_id: str
    session_id: str | None
    parent_call_id: str | None
    model_provider: str
    model_name: str
    model_version: str
    model_configuration: dict[str, Any]
    prompt_template_id: str
    prompt_template_version: str
    operator_id: str
    prompt_fingerprint: str
    input_fingerprint: str
    input_pii_redacted: dict[str, Any] | None
    reference_database: str | None


class AuditLogger(ProviderHostLogger):
    """Tamper-evident audit log writer. One instance per system_id."""

    def __init__(
        self,
        *,
        system_id: str,
        storage: StorageBackend,
        signer: Signer,
        pii_redactor: PiiRedactor | None = None,
        pii_token_store: PiiTokenStore | None = None,
        retention_minimum_days: int = RETENTION_DEFAULTS.deployer_minimum_days,
        retention_target_days: int = RETENTION_DEFAULTS.provider_target_days,
    ) -> None:
        if not system_id or not system_id.strip():
            raise AuditLayerConfigError(
                ERROR_CODES["CONFIG_MISSING_FIELD"],
                "AuditLogger: system_id is required",
                {"field": "system_id"},
            )
        assert_safe_path_segment(system_id, "systemId")
        self.system_id = system_id
        self.storage = storage
        self.signer = signer
        self.pii_redactor = pii_redactor or PiiRedactor(enabled=False)
        self._pii_token_store = pii_token_store
        # Retention metadata is informational; the SDK does not enforce retention.
        self.retention_minimum_days = retention_minimum_days
        self.retention_target_days = retention_target_days

        self._pending: dict[str, _PendingCall] = {}
        self._last_entry: dict[str, Any] | None = None
        # Serializes chain link + append so the chain stays linear across threads.
        self._chain_lock = threading.Lock()

    # ------------------------------------------------------------- public API

    def start_call(
        self,
        *,
        case_id: str,
        model_provider: str,
        model_name: str,
        model_version: str,
        prompt_template_id: str,
        prompt_template_version: str,
        operator_id: str,
        session_id: str | None = None,
        parent_call_id: str | None = None,
        model_configuration: dict[str, Any] | None = None,
        input: Any = None,
        prompt: Any = None,
        reference_database: str | None = None,
    ) -> str:
        if not case_id or not case_id.strip():
            raise AuditLayerConfigError(
                ERROR_CODES["CONFIG_MISSING_FIELD"],
                "start_call: case_id is required",
                {"field": "case_id"},
            )
        call_id = uuid_v4()
        started_at = now_iso()
        redacted = self.pii_redactor.redact(input, case_id)
        prompt_for_fp = prompt if prompt is not None else input
        pending = _PendingCall(
            call_id=call_id,
            started_at=started_at,
            case_id=case_id,
            session_id=session_id,
            parent_call_id=parent_call_id,
            model_provider=model_provider,
            model_name=model_name,
            model_version=model_version,
            model_configuration=model_configuration or {},
            prompt_template_id=prompt_template_id,
            prompt_template_version=prompt_template_version,
            operator_id=operator_id,
            prompt_fingerprint=fingerprint(prompt_for_fp),
            input_fingerprint=fingerprint(redacted.redacted),
            input_pii_redacted=(
                {
                    "fields": redacted.fields_touched,
                    "pseudonymKey": redacted.pseudonym_key,
                }
                if redacted.fields_touched
                else None
            ),
            reference_database=reference_database,
        )
        self._pending[call_id] = pending
        return call_id

    def end_call(
        self,
        call_id: str,
        *,
        output: Any = None,
        output_decision: Any = None,
        reason_codes: list[str] | None = None,
        risk_flags: list[str] | None = None,
        human_review: dict[str, Any] | None = None,
        incident_id: str | None = None,
    ) -> dict[str, Any]:
        pending = self._pending.pop(call_id, None)
        if pending is None:
            raise AuditLayerLifecycleError(
                ERROR_CODES["LOGGER_CALL_NOT_PENDING"],
                f"end_call: callId {call_id} is not in the pending set "
                "(already finalised or never started).",
                {"callId": call_id},
            )
        ended_at = now_iso()
        decided = output_decision if output_decision is not None else output
        output_fp = fingerprint(decided)
        input_for_entry: dict[str, Any] = {
            "schemaVersion": SCHEMA_VERSION,
            "recordedBy": RECORDED_BY,
            "callId": pending.call_id,
            "caseId": pending.case_id,
            "systemId": self.system_id,
            "startedAt": pending.started_at,
            "endedAt": ended_at,
            "durationMs": derive_duration_ms(pending.started_at, ended_at),
            "modelProvider": pending.model_provider,
            "modelName": pending.model_name,
            "modelVersion": pending.model_version,
            "modelConfiguration": pending.model_configuration,
            "promptTemplateId": pending.prompt_template_id,
            "promptTemplateVersion": pending.prompt_template_version,
            "promptFingerprint": pending.prompt_fingerprint,
            "inputFingerprint": pending.input_fingerprint,
            "outputFingerprint": output_fp,
            "outputDecision": decided,
            "operatorId": pending.operator_id,
        }
        if pending.parent_call_id is not None:
            input_for_entry["parentCallId"] = pending.parent_call_id
        if pending.session_id is not None:
            input_for_entry["sessionId"] = pending.session_id
        if pending.input_pii_redacted is not None:
            input_for_entry["inputPiiRedacted"] = pending.input_pii_redacted
        if pending.reference_database is not None:
            input_for_entry["referenceDatabase"] = pending.reference_database
        if reason_codes is not None:
            input_for_entry["reasonCodes"] = reason_codes
        if risk_flags is not None:
            input_for_entry["riskFlags"] = risk_flags
        if human_review is not None:
            input_for_entry["humanReview"] = human_review
        if incident_id is not None:
            input_for_entry["incidentId"] = incident_id

        return self._persist(input_for_entry)

    def wrap(self, client: Any, context: WrapContext) -> Any:
        """Wrap a sync provider client (mutates in place, returns it)."""

        return wrap_client(self, client, context)

    def wrap_async(self, client: Any, context: WrapContext) -> Any:
        """Wrap an async provider client.

        Spec §2.3 requires the async surface to be distinct from ``wrap()``;
        detection is by ``inspect.iscoroutinefunction`` on the client's
        generation method so an ``AsyncAnthropic`` cannot be silently
        downgraded to the sync path or vice versa.
        """

        return wrap_client_async(self, client, context)

    def close(self) -> None:
        self.storage.close()
        if self._pii_token_store is not None:
            self._pii_token_store.close()

    # ------------------------------------------------------------ persistence

    def _persist(self, entry_input: dict[str, Any]) -> dict[str, Any]:
        with self._chain_lock:
            linked = link_entry(entry_input, self._last_entry)
            signature = self.signer.sign(linked["entryHash"])
            entry = {**linked, "signature": signature}
            recheck_payload = {
                k: v for k, v in entry.items() if k not in ("entryHash", "signature")
            }
            recheck = compute_entry_hash(recheck_payload)
            if recheck != entry["entryHash"]:
                raise AuditLayerSchemaError(
                    ERROR_CODES["SCHEMA_HASH_RECHECK_FAILED"],
                    "AuditLogger: entry hash recheck failed before persistence",
                    {
                        "callId": entry["callId"],
                        "expected": entry["entryHash"],
                        "computed": recheck,
                    },
                )
            self.storage.append(entry, AppendOptions(system_id=self.system_id))
            self._last_entry = entry
            return entry

    # ------------------------------------------------------------------ query

    def list(
        self,
        *,
        case_id: str | None = None,
        from_: str | None = None,
        to: str | None = None,
    ) -> Any:
        """Iterate entries for queries. Shorthand around backend.list."""

        return self.storage.list(
            QueryOptions(system_id=self.system_id, case_id=case_id, from_=from_, to=to),
        )
