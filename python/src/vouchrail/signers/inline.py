"""HMAC-SHA256 inline signer — dev / test use only.

Mirrors ``InlineSigner`` in ``packages/sdk/src/signing.ts``. Produces
byte-identical signatures for the same secret + entry hash so a chain
written by one SDK can be verified by the other.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import warnings

from ..defaults import SIGNING_DEFAULTS
from ..errors import ERROR_CODES, VouchRailSignerError
from .base import Signer

_inline_signer_warned = False


class InlineSigner(Signer):
    key_id = SIGNING_DEFAULTS.inline_key_id

    def __init__(self, secret: str) -> None:
        if not secret or len(secret) < SIGNING_DEFAULTS.inline_secret_min_length:
            raise VouchRailSignerError(
                ERROR_CODES["SIGNER_INVALID_SECRET"],
                f"InlineSigner: secret must be at least "
                f"{SIGNING_DEFAULTS.inline_secret_min_length} characters. "
                f"Inline signing is intended for development only; use a KMS signer in production.",
                {"minLength": SIGNING_DEFAULTS.inline_secret_min_length},
            )
        global _inline_signer_warned
        # Warn once per process so dev / test loops stay quiet.
        if (
            not _inline_signer_warned
            and os.environ.get("VOUCHRAIL_SUPPRESS_INLINE_WARNING") != "1"
        ):
            _inline_signer_warned = True
            warnings.warn(
                "InlineSigner is intended for development only. "
                "Use a KMS-backed signer in production.",
                UserWarning,
                stacklevel=2,
            )
        self._secret = secret.encode("utf-8")

    def sign(self, entry_hash_hex: str) -> str:
        mac = hmac.new(self._secret, entry_hash_hex.encode("utf-8"), hashlib.sha256).hexdigest()
        return f"{SIGNING_DEFAULTS.inline_signature_prefix}:{self.key_id}:{mac}"
