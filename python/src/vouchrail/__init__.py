"""VouchRail Python SDK — EU AI Act Article 12 audit log infrastructure."""

from .defaults import (
    CLI_DEFAULTS,
    HASH_CHAIN_DEFAULTS,
    PII_DEFAULTS,
    RETENTION_DEFAULTS,
    SIGNING_DEFAULTS,
    STORAGE_DEFAULTS,
)
from .errors import (
    ERROR_CODES,
    VouchRailConfigError,
    VouchRailError,
    VouchRailLifecycleError,
    VouchRailPiiError,
    VouchRailProviderError,
    VouchRailSchemaError,
    VouchRailSignerError,
    VouchRailStorageError,
)
from .logger import RECORDED_BY, AuditLogger
from .pii import (
    InMemoryPiiTokenStore,
    PiiRedactor,
    PiiTokenStore,
    SqlitePiiTokenStore,
    detect_pii,
    hash_string,
)
from .pii_patterns import (
    ALL_PII_PATTERN_NAMES,
    DEFAULT_ENABLED_PII_PATTERNS,
    PII_PATTERN_REGISTRY,
)
from .providers import (
    BUILT_IN_PROVIDER_ADAPTERS,
    PROVIDER_ERROR_RISK_FLAG,
    ProviderAdapter,
    ProviderHostLogger,
    detect_adapter,
    register_provider,
    resolve_adapters,
    unregister_provider,
    wrap_client,
)
from .providers.base import WrapContext
from .schema import (
    GENESIS_PREVIOUS_HASH,
    HASH_ALGORITHM,
    SCHEMA_VERSION,
    SDK_NAME,
    SDK_VERSION,
    AuditLogEntry,
    AuditLogEntryInput,
    canonicalize,
    canonicalize_for_hash,
    compute_entry_hash,
    link_entry,
    verify_chain,
    verify_entry_hash,
)
from .signers import InlineSigner, Signer
from .storage import LocalStorageBackend, StorageBackend
from .util import (
    assert_safe_path_segment,
    derive_duration_ms,
    fingerprint,
    now_iso,
    uuid_v4,
)

__all__ = [
    "ALL_PII_PATTERN_NAMES",
    "BUILT_IN_PROVIDER_ADAPTERS",
    "CLI_DEFAULTS",
    "DEFAULT_ENABLED_PII_PATTERNS",
    "ERROR_CODES",
    # Schema (Tier S2)
    "GENESIS_PREVIOUS_HASH",
    "HASH_ALGORITHM",
    "HASH_CHAIN_DEFAULTS",
    "PII_DEFAULTS",
    "PII_PATTERN_REGISTRY",
    "PROVIDER_ERROR_RISK_FLAG",
    "RECORDED_BY",
    "RETENTION_DEFAULTS",
    "SCHEMA_VERSION",
    "SDK_NAME",
    "SDK_VERSION",
    "SIGNING_DEFAULTS",
    # Defaults
    "STORAGE_DEFAULTS",
    "AuditLogEntry",
    "AuditLogEntryInput",
    # Core SDK
    "AuditLogger",
    "InMemoryPiiTokenStore",
    "InlineSigner",
    "LocalStorageBackend",
    # PII
    "PiiRedactor",
    "PiiTokenStore",
    # Providers
    "ProviderAdapter",
    "ProviderHostLogger",
    # Signers
    "Signer",
    "SqlitePiiTokenStore",
    # Storage
    "StorageBackend",
    "VouchRailConfigError",
    # Errors
    "VouchRailError",
    "VouchRailLifecycleError",
    "VouchRailPiiError",
    "VouchRailProviderError",
    "VouchRailSchemaError",
    "VouchRailSignerError",
    "VouchRailStorageError",
    "WrapContext",
    # Util
    "assert_safe_path_segment",
    "canonicalize",
    "canonicalize_for_hash",
    "compute_entry_hash",
    "derive_duration_ms",
    "detect_adapter",
    "detect_pii",
    "fingerprint",
    "hash_string",
    "link_entry",
    "now_iso",
    "register_provider",
    "resolve_adapters",
    "unregister_provider",
    "uuid_v4",
    "verify_chain",
    "verify_entry_hash",
    "wrap_client",
]
