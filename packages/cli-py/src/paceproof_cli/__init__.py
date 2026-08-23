"""paceproof-cli: verify Ed25519-signed compute-attestation records and report
what compute was actually run, by whom, and whether every signature checks out.

Genuine Python reimplementation of the schema validator, Ed25519 verifier,
aggregator, and report renderer that ship in the npm package `paceproof-cli`
-- not a subprocess wrapper around it. See ARCHITECTURE.md.
"""

from importlib.metadata import PackageNotFoundError, version

try:
    # Single source of truth: read the version from the installed
    # distribution's metadata (which hatchling derives from pyproject.toml's
    # [project].version) instead of duplicating it as a hardcoded string that
    # can drift out of sync -- see the equivalent fix for the TypeScript
    # package's src/version.ts.
    __version__ = version("paceproof-cli")
except PackageNotFoundError:
    # Editable/uninstalled checkout (e.g. running straight from source
    # without `pip install`): fall back to a clearly-labeled placeholder
    # rather than a stale hardcoded version string.
    __version__ = "0.0.0-dev"
