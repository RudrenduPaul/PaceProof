"""paceproof-cli: verify Ed25519-signed compute-attestation records and report
what compute was actually run, by whom, and whether every signature checks out.

Genuine Python reimplementation of the schema validator, Ed25519 verifier,
aggregator, and report renderer that ship in the npm package `paceproof-cli`
-- not a subprocess wrapper around it. See ARCHITECTURE.md.
"""

__version__ = "0.1.0"
