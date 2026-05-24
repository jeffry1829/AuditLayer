"""Anthropic provider adapter (sync wrap_anthropic)."""

from __future__ import annotations

import inspect
import re
from typing import Any

from ._shared import WrapCreateOptions, build_sync_wrapper
from .base import ProviderHostLogger, WrapContext

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


def _anthropic_wrap_options() -> WrapCreateOptions:
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
        messages.create = build_sync_wrapper(
            audit, messages.create, context, _anthropic_wrap_options(),
        )


anthropic_adapter = AnthropicAdapter()
