"""Provider registry — first-detect-wins, custom adapters take precedence.

Mirrors ``packages/sdk/src/providers/registry.ts``.
"""

from __future__ import annotations

from typing import Any

from ..errors import ERROR_CODES, VouchRailProviderError
from .anthropic import anthropic_adapter
from .anthropic_async import async_anthropic_adapter
from .base import ProviderAdapter, ProviderHostLogger, WrapContext
from .openai import openai_adapter
from .openai_async import async_openai_adapter

# Sync built-ins: ``wrap()`` resolves against this list.
BUILT_IN_PROVIDER_ADAPTERS: tuple[ProviderAdapter, ...] = (anthropic_adapter, openai_adapter)

# Async built-ins: ``wrap_async()`` resolves against this list. Async adapters
# detect on the basis of ``inspect.iscoroutinefunction``, so they only match
# AsyncAnthropic / AsyncOpenAI-shaped clients (not their sync counterparts).
BUILT_IN_ASYNC_PROVIDER_ADAPTERS: tuple[ProviderAdapter, ...] = (
    async_anthropic_adapter,
    async_openai_adapter,
)

_custom_adapters: list[ProviderAdapter] = []
_custom_async_adapters: list[ProviderAdapter] = []


def register_provider(adapter: ProviderAdapter, *, async_: bool = False) -> None:
    """Register a custom adapter.

    By default the adapter is added to the sync registry; pass ``async_=True``
    to register against ``wrap_async()`` instead.
    """

    (_custom_async_adapters if async_ else _custom_adapters).append(adapter)


def unregister_provider(provider_id: str, *, async_: bool = False) -> None:
    bucket = _custom_async_adapters if async_ else _custom_adapters
    for i, a in enumerate(bucket):
        if a.provider_id == provider_id:
            del bucket[i]
            return


def resolve_adapters(*, async_: bool = False) -> tuple[ProviderAdapter, ...]:
    if async_:
        return tuple(_custom_async_adapters) + BUILT_IN_ASYNC_PROVIDER_ADAPTERS
    return tuple(_custom_adapters) + BUILT_IN_PROVIDER_ADAPTERS


def detect_adapter(client: Any, *, async_: bool = False) -> ProviderAdapter | None:
    for adapter in resolve_adapters(async_=async_):
        if adapter.detect(client):
            return adapter
    return None


def _raise_unsupported(client: Any, *, async_: bool) -> None:
    builtins = BUILT_IN_ASYNC_PROVIDER_ADAPTERS if async_ else BUILT_IN_PROVIDER_ADAPTERS
    surface = "wrap_async" if async_ else "wrap"
    raise VouchRailProviderError(
        ERROR_CODES["PROVIDER_UNSUPPORTED_CLIENT"],
        f"AuditLogger.{surface}: client does not match any registered "
        f"{'async ' if async_ else ''}provider adapter. "
        "Built-in adapters: " + ", ".join(a.provider_id for a in builtins) + ". "
        "Use start_call/end_call directly for unsupported clients, or call "
        f"register_provider({'async_=True' if async_ else ''}) with a custom adapter.",
        {
            "registered": [a.provider_id for a in resolve_adapters(async_=async_)],
            "async": async_,
        },
    )


def wrap_client(audit: ProviderHostLogger, client: Any, context: WrapContext) -> Any:
    """Wrap a sync ``client`` in place; return the same reference."""

    adapter = detect_adapter(client, async_=False)
    if adapter is None:
        _raise_unsupported(client, async_=False)
    adapter.wrap(audit, client, context)
    return client


def wrap_client_async(audit: ProviderHostLogger, client: Any, context: WrapContext) -> Any:
    """Wrap an async ``client`` in place; return the same reference.

    The async path is identified by ``inspect.iscoroutinefunction`` on the
    provider's generation method so callers cannot accidentally wrap a sync
    client with the async path or vice versa.
    """

    adapter = detect_adapter(client, async_=True)
    if adapter is None:
        _raise_unsupported(client, async_=True)
    adapter.wrap(audit, client, context)
    return client
