"""Pin SDK_VERSION to the installed-package metadata.

The SDK reads SDK_VERSION from importlib.metadata so it stays in lockstep with
pyproject.toml. A regression where someone re-hardcodes the constant would
silently drift from the published wheel version; this test catches that.
"""

from __future__ import annotations

import re

import pytest

from auditlayer import SDK_NAME, SDK_VERSION


def test_sdk_name_matches_distribution():
    assert SDK_NAME == "auditlayer"


def test_sdk_version_looks_like_semver_or_local_fallback():
    # Either a real semver (when installed) or the "0+local" sentinel (when
    # running from source tree without `pip install -e .`).
    assert re.fullmatch(r"\d+\.\d+\.\d+(?:[\.\-+].*)?|0\+local", SDK_VERSION), (
        f"SDK_VERSION={SDK_VERSION!r} is neither a semver nor the local fallback"
    )


def test_sdk_version_resolves_from_package_metadata_when_installed():
    try:
        from importlib.metadata import PackageNotFoundError, version

        installed = version(SDK_NAME)
    except PackageNotFoundError:
        pytest.skip("package not installed; runtime metadata not available")
    assert SDK_VERSION == installed
