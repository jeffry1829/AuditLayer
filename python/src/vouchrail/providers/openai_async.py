"""Async OpenAI provider adapter (wrap_openai_async)."""

from __future__ import annotations

import inspect
from typing import Any

from ._shared import WrapCreateOptions, build_async_wrapper
from .base import ProviderHostLogger, WrapContext
from .openai import OPENAI_CONFIG_KEYS, OPENAI_OUTPUT_KEYS


def _openai_async_options() -> WrapCreateOptions:
    def model_info(params: dict[str, Any]) -> tuple[str, str]:
        model = str(params.get("model") or "unknown")
        return model, model

    def input_snapshot(params: dict[str, Any]) -> Any:
        return {"messages": params.get("messages")}

    return WrapCreateOptions(
        provider_id="openai",
        config_keys=OPENAI_CONFIG_KEYS,
        output_keys=OPENAI_OUTPUT_KEYS,
        build_model_info=model_info,
        build_input=input_snapshot,
    )


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
        completions.create = build_async_wrapper(
            audit, completions.create, context, _openai_async_options(),
        )


async_openai_adapter = AsyncOpenAiAdapter()
