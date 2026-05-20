"""Anthropic provider adapter (sync wrap_anthropic)."""

from __future__ import annotations

import inspect
import re
from typing import Any

from .base import PROVIDER_ERROR_RISK_FLAG, ProviderHostLogger, WrapContext

ANTHROPIC_CONFIG_KEYS: tuple[str, ...] = (
    "temperature",
    "top_p",
    "top_k",
    "max_tokens",
    "stop_sequences",
)

ANTHROPIC_OUTPUT_KEYS: tuple[str, ...] = ("content", "usage", "model", "id")

ANTHROPIC_SNAPSHOT_REGEX = re.compile(r"-(\d{8})$")


def derive_anthropic_model_version(model: str) -> str:
    m = ANTHROPIC_SNAPSHOT_REGEX.search(model)
    if m:
        return m.group(1)
    return model or "unknown"


def _pick_keys(params: dict[str, Any], keys: tuple[str, ...]) -> dict[str, Any]:
    return {k: params[k] for k in keys if k in params}


def _extract_output(response: Any, keys: tuple[str, ...]) -> Any:
    if isinstance(response, dict):
        return {k: response.get(k) for k in keys}
    return response


class AnthropicAdapter:
    provider_id = "anthropic"

    def detect(self, client: Any) -> bool:
        messages = getattr(client, "messages", None)
        if messages is None:
            return False
        create = getattr(messages, "create", None)
        if not callable(create):
            return False
        # Async clients are handled by the async adapter; the sync path must
        # not accidentally wrap a coroutine function (the wrapper would treat
        # the unawaited coroutine as the response).
        return not inspect.iscoroutinefunction(create)

    def wrap(self, audit: ProviderHostLogger, client: Any, context: WrapContext) -> None:
        messages = client.messages
        original_create = messages.create

        def wrapped_create(*args: Any, **kwargs: Any) -> Any:
            params: dict[str, Any] = dict(kwargs)
            if args:
                # Anthropic SDK uses kwargs in practice; positional dict path is
                # supported here for symmetry with mock clients used in tests.
                first = args[0]
                if isinstance(first, dict):
                    params = {**first, **params}
            model = str(params.get("model") or "unknown")
            call_id = audit.start_call(
                case_id=context.case_id,
                session_id=context.session_id,
                parent_call_id=context.parent_call_id,
                model_provider="anthropic",
                model_name=model,
                model_version=derive_anthropic_model_version(model),
                model_configuration=_pick_keys(params, ANTHROPIC_CONFIG_KEYS),
                prompt_template_id=context.prompt_template_id,
                prompt_template_version=context.prompt_template_version,
                operator_id=context.operator_id,
                input={"messages": params.get("messages"), "system": params.get("system")},
            )
            try:
                response = original_create(*args, **kwargs)
                output = _extract_output(response, ANTHROPIC_OUTPUT_KEYS)
                audit.end_call(call_id, output=output, output_decision=output)
                return response
            except Exception:
                audit.end_call(
                    call_id,
                    output=None,
                    output_decision=None,
                    risk_flags=[PROVIDER_ERROR_RISK_FLAG],
                )
                raise

        messages.create = wrapped_create


anthropic_adapter = AnthropicAdapter()
