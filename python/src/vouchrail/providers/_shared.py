"""Helpers reused by every provider adapter."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from .base import PROVIDER_ERROR_RISK_FLAG, ProviderHostLogger, WrapContext


def pick_keys(params: dict[str, Any], keys: tuple[str, ...]) -> dict[str, Any]:
    return {k: params[k] for k in keys if k in params}


def extract_output(response: Any, keys: tuple[str, ...]) -> Any:
    if isinstance(response, dict):
        return {k: response.get(k) for k in keys}
    return response


def merge_first_dict_arg(args: tuple[Any, ...], kwargs: dict[str, Any]) -> dict[str, Any]:
    """Anthropic/OpenAI SDKs accept kwargs; mock clients used in tests sometimes
    pass a dict positionally. Merge both into one params dict, with kwargs
    winning on key collisions."""
    params: dict[str, Any] = dict(kwargs)
    if args:
        first = args[0]
        if isinstance(first, dict):
            params = {**first, **params}
    return params


class WrapCreateOptions:
    """Per-provider knobs passed to ``build_sync_wrapper`` / ``build_async_wrapper``."""

    __slots__ = (
        "build_input",
        "build_model_info",
        "config_keys",
        "output_keys",
        "provider_id",
    )

    def __init__(
        self,
        *,
        provider_id: str,
        config_keys: tuple[str, ...],
        output_keys: tuple[str, ...],
        build_model_info: Callable[[dict[str, Any]], tuple[str, str]],
        build_input: Callable[[dict[str, Any]], Any],
    ) -> None:
        self.provider_id = provider_id
        self.config_keys = config_keys
        self.output_keys = output_keys
        self.build_model_info = build_model_info
        self.build_input = build_input


def _start_args(
    params: dict[str, Any],
    context: WrapContext,
    opts: WrapCreateOptions,
) -> dict[str, Any]:
    model_name, model_version = opts.build_model_info(params)
    return {
        "case_id": context.case_id,
        "session_id": context.session_id,
        "parent_call_id": context.parent_call_id,
        "model_provider": opts.provider_id,
        "model_name": model_name,
        "model_version": model_version,
        "model_configuration": pick_keys(params, opts.config_keys),
        "prompt_template_id": context.prompt_template_id,
        "prompt_template_version": context.prompt_template_version,
        "operator_id": context.operator_id,
        "input": opts.build_input(params),
    }


def build_sync_wrapper(
    audit: ProviderHostLogger,
    original: Callable[..., Any],
    context: WrapContext,
    opts: WrapCreateOptions,
) -> Callable[..., Any]:
    """Build a sync wrapper that emits start/end audit pairs around ``original``."""

    def wrapped(*args: Any, **kwargs: Any) -> Any:
        params = merge_first_dict_arg(args, kwargs)
        call_id = audit.start_call(**_start_args(params, context, opts))
        try:
            response = original(*args, **kwargs)
            output = extract_output(response, opts.output_keys)
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

    return wrapped


def build_async_wrapper(
    audit: ProviderHostLogger,
    original: Callable[..., Awaitable[Any]],
    context: WrapContext,
    opts: WrapCreateOptions,
) -> Callable[..., Awaitable[Any]]:
    """Build an async wrapper that emits start/end audit pairs around ``original``."""

    async def wrapped(*args: Any, **kwargs: Any) -> Any:
        params = merge_first_dict_arg(args, kwargs)
        call_id = audit.start_call(**_start_args(params, context, opts))
        try:
            response = await original(*args, **kwargs)
            output = extract_output(response, opts.output_keys)
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

    return wrapped
