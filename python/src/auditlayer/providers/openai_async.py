"""Async OpenAI provider adapter (wrap_openai_async)."""

from __future__ import annotations

import inspect
from typing import Any

from .base import PROVIDER_ERROR_RISK_FLAG, ProviderHostLogger, WrapContext
from .openai import OPENAI_CONFIG_KEYS, OPENAI_OUTPUT_KEYS


def _pick_keys(params: dict[str, Any], keys: tuple[str, ...]) -> dict[str, Any]:
    return {k: params[k] for k in keys if k in params}


def _extract_output(response: Any, keys: tuple[str, ...]) -> Any:
    if isinstance(response, dict):
        return {k: response.get(k) for k in keys}
    return response


class AsyncOpenAiAdapter:
    """Detects ``AsyncOpenAI``-shaped clients (``chat.completions.create`` is awaitable)."""

    provider_id = "openai"

    def detect(self, client: Any) -> bool:
        chat = getattr(client, "chat", None)
        if chat is None:
            return False
        completions = getattr(chat, "completions", None)
        if completions is None:
            return False
        create = getattr(completions, "create", None)
        if not callable(create):
            return False
        return inspect.iscoroutinefunction(create)

    def wrap(self, audit: ProviderHostLogger, client: Any, context: WrapContext) -> None:
        completions = client.chat.completions
        original_create = completions.create

        async def wrapped_create(*args: Any, **kwargs: Any) -> Any:
            params: dict[str, Any] = dict(kwargs)
            if args:
                first = args[0]
                if isinstance(first, dict):
                    params = {**first, **params}
            model = str(params.get("model") or "unknown")
            call_id = audit.start_call(
                case_id=context.case_id,
                session_id=context.session_id,
                parent_call_id=context.parent_call_id,
                model_provider="openai",
                model_name=model,
                model_version=model,
                model_configuration=_pick_keys(params, OPENAI_CONFIG_KEYS),
                prompt_template_id=context.prompt_template_id,
                prompt_template_version=context.prompt_template_version,
                operator_id=context.operator_id,
                input={"messages": params.get("messages")},
            )
            try:
                response = await original_create(*args, **kwargs)
                output = _extract_output(response, OPENAI_OUTPUT_KEYS)
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

        completions.create = wrapped_create


async_openai_adapter = AsyncOpenAiAdapter()
