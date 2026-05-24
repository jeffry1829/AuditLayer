"""Async Anthropic provider adapter (wrap_anthropic_async)."""

from __future__ import annotations

import inspect
from typing import Any

from ._shared import WrapCreateOptions, build_async_wrapper
from .anthropic import (
    ANTHROPIC_CONFIG_KEYS,
    ANTHROPIC_OUTPUT_KEYS,
    derive_anthropic_model_version,
)
from .base import ProviderHostLogger, WrapContext


def _anthropic_async_options() -> WrapCreateOptions:
    def model_info(params: dict[str, Any]) -> tuple[str, str]:
        model = str(params.get("model") or "unknown")
        return model, derive_anthropic_model_version(model)

    def input_snapshot(params: dict[str, Any]) -> Any:
        return {"messages": params.get("messages"), "system": params.get("system")}

    return WrapCreateOptions(
        provider_id="anthropic",
        config_keys=ANTHROPIC_CONFIG_KEYS,
        output_keys=ANTHROPIC_OUTPUT_KEYS,
        build_model_info=model_info,
        build_input=input_snapshot,
    )


class AsyncAnthropicAdapter:
    """Detects ``AsyncAnthropic``-shaped clients (``messages.create`` is awaitable)."""

    provider_id = "anthropic"

    def detect(self, client: Any) -> bool:
        messages = getattr(client, "messages", None)
        if messages is None:
            return False
        create = getattr(messages, "create", None)
        if not callable(create):
            return False
        return inspect.iscoroutinefunction(create)

    def wrap(self, audit: ProviderHostLogger, client: Any, context: WrapContext) -> None:
        messages = client.messages
        messages.create = build_async_wrapper(
            audit, messages.create, context, _anthropic_async_options(),
        )


async_anthropic_adapter = AsyncAnthropicAdapter()
