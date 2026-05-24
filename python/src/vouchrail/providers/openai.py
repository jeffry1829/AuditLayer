"""OpenAI provider adapter (sync wrap_openai)."""

from __future__ import annotations

import inspect
from typing import Any

from ._shared import WrapCreateOptions, build_sync_wrapper
from .base import ProviderHostLogger, WrapContext

OPENAI_CONFIG_KEYS: tuple[str, ...] = (
    "temperature",
    "top_p",
    "max_tokens",
    "frequency_penalty",
    "presence_penalty",
)

OPENAI_OUTPUT_KEYS: tuple[str, ...] = ("choices", "usage", "model", "id")


def _openai_wrap_options() -> WrapCreateOptions:
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


class OpenAiAdapter:
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
        return not inspect.iscoroutinefunction(create)

    def wrap(self, audit: ProviderHostLogger, client: Any, context: WrapContext) -> None:
        completions = client.chat.completions
        completions.create = build_sync_wrapper(
            audit, completions.create, context, _openai_wrap_options(),
        )


openai_adapter = OpenAiAdapter()
