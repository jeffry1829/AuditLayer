"""Single source of truth for built-in PII patterns — Python parity with TS.

Mirrors ``packages/sdk/src/pii-patterns.ts``. The ``id`` and
``default_enabled`` flags are identical to the TS registry so that the
cross-platform behavior matches when the user passes ``patterns=None``.

All patterns are bounded in length to avoid catastrophic-backtracking
risk on adversarial input.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Final


@dataclass(frozen=True)
class PiiPatternDefinition:
    id: str
    description: str
    regex: re.Pattern[str]
    default_enabled: bool


PII_PATTERN_REGISTRY: Final[Mapping[str, PiiPatternDefinition]] = MappingProxyType(
    {
        "email": PiiPatternDefinition(
            id="email",
            description="RFC 5322 style email addresses, bounded length",
            regex=re.compile(
                r"[A-Za-z0-9._%+-]{1,64}"
                r"@[A-Za-z0-9-]{1,63}"
                r"(?:\.[A-Za-z0-9-]{1,63}){0,4}"
                r"\.[A-Za-z]{2,24}",
            ),
            default_enabled=True,
        ),
        "phone": PiiPatternDefinition(
            id="phone",
            description="International dial-format phone numbers",
            regex=re.compile(r"\+?\d[\d ()-]{6,30}\d"),
            default_enabled=True,
        ),
        "ssn": PiiPatternDefinition(
            id="ssn",
            description="US Social Security Number (NNN-NN-NNNN)",
            regex=re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
            default_enabled=True,
        ),
        "nhsNumber": PiiPatternDefinition(
            id="nhsNumber",
            description="UK NHS Number (10 digits, optional spaces/dashes)",
            regex=re.compile(r"\b\d{3}[ -]?\d{3}[ -]?\d{4}\b"),
            default_enabled=False,
        ),
        "euNationalId": PiiPatternDefinition(
            id="euNationalId",
            description="EU national identifier (alphanumeric, 1-2 prefix letters)",
            regex=re.compile(r"\b[A-Z]{1,2}\d{6,12}[A-Z]?\b"),
            default_enabled=False,
        ),
        "ipAddress": PiiPatternDefinition(
            id="ipAddress",
            description="IPv4 dotted-quad",
            regex=re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
            default_enabled=True,
        ),
        "creditCard": PiiPatternDefinition(
            id="creditCard",
            description="Credit/payment card numbers, 13-19 digits with optional separators",
            regex=re.compile(r"\b\d(?:[ -]?\d){12,18}\b"),
            default_enabled=True,
        ),
        "iban": PiiPatternDefinition(
            id="iban",
            description="IBAN (ISO 13616)",
            regex=re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b"),
            default_enabled=True,
        ),
        "name": PiiPatternDefinition(
            id="name",
            description="Capitalized two-token Western personal name (heuristic)",
            regex=re.compile(r"\b[A-Z][a-z]{1,20} [A-Z][a-z]{1,20}\b"),
            default_enabled=False,
        ),
        "address": PiiPatternDefinition(
            id="address",
            description="Numeric-prefixed Western street address (heuristic)",
            regex=re.compile(
                r"\b\d{1,5}\s+(?:[A-Z][a-z]{1,20}\s){1,4}"
                r"(?:Street|Avenue|Road|Lane|Boulevard|Drive|Court|Place|St|Ave|Rd|Blvd|Dr)\b",
            ),
            default_enabled=False,
        ),
    },
)


ALL_PII_PATTERN_NAMES: Final[tuple[str, ...]] = tuple(PII_PATTERN_REGISTRY.keys())

DEFAULT_ENABLED_PII_PATTERNS: Final[Mapping[str, bool]] = MappingProxyType(
    {name: defn.default_enabled for name, defn in PII_PATTERN_REGISTRY.items()},
)
