# Security Policy

## Reporting a vulnerability

Please open a GitHub issue at [RudrenduPaul/PaceProof/issues](https://github.com/RudrenduPaul/PaceProof/issues).

If the report involves a way to make an unverified or tampered attestation record appear in a
"verified" aggregate total, say so explicitly in the title -- that is the class of bug this
project treats as highest severity, since it defeats the security invariant the whole tool exists
to enforce.

## Supported versions

Only the latest published release on npm (`paceproof-cli`) and PyPI (`paceproof-cli`) is
supported. Fixes land on `main` and ship in the next release; there is no backport policy for
older versions yet.

## Scope

In scope: the Ed25519 signature verifier, the aggregator (especially the verified/unverified
total-separation invariant), the schema validator, the `ingest` network path (timeout and
response-size enforcement), and the MCP server. Out of scope: the authenticity of attestation
records themselves -- PaceProof verifies that a record's signature is valid for its claimed
issuer key, not whether that issuer or its underlying hardware claims are trustworthy.
