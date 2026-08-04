# Architecture

PaceProof is a reporting layer over already-signed compute-attestation
records. It does not sign, generate, or attest anything itself. This document
describes the repo layout, the canonical schema, and how the two
implementations stay in sync.

## Repo layout

This is a two-package monorepo. There is no shared build tooling between the
packages on purpose: each ships as an independent, real package on its own
registry (npm and PyPI), and each has to work if someone clones only that
subdirectory.

```
PaceProof/
  schema/attestation-record.schema.json   # single source of truth schema
  packages/
    cli-ts/                               # npm package: paceproof-cli
      src/
        schema.ts                         # ajv-based validation
        crypto.ts                         # Ed25519 verification + canonical JSON
        types.ts                          # shared TS types
        adapters/
          types.ts                        # Adapter interface
          jsonl.ts                        # reference adapter
        aggregator.ts                     # verify + aggregate records
        report.ts                         # human-readable + --json report rendering
        dashboard.ts                      # self-contained static HTML renderer
        init.ts                           # `paceproof init` example scaffolding
        mcp.ts                            # MCP server (verify/ingest/report tools)
        cli.ts                            # commander-based CLI entrypoint
        bin.ts                            # #!/usr/bin/env node shim
      test/                               # Vitest
      schema/attestation-record.schema.json  # copy of the root schema, kept in sync
    cli-py/                               # PyPI package: paceproof-cli
      src/paceproof_cli/
        schema.py                         # jsonschema-based validation
        crypto.py                         # PyNaCl Ed25519 verification + canonical JSON
        types.py
        adapters/
          base.py                         # Adapter ABC
          jsonl.py                        # reference adapter
        aggregator.py
        report.py
        dashboard.py
        init.py
        mcp.py
        cli.py                            # click/argparse entrypoint
        schema/attestation-record.schema.json  # copy of the root schema, kept in sync
      tests/                              # pytest
  .github/workflows/ci.yml
  ARCHITECTURE.md
  README.md
  LICENSE
  CLAUDE.md                               # locked product/architecture spec (do not edit casually)
```

## Why a copy of the schema in each package

Both packages need the schema file to exist inside their own published
artifact (an npm tarball or a PyPI wheel cannot reference a file living
outside the package root at install time). `schema/attestation-record.schema.json`
at the repo root is the single source of truth a human edits; the copies
under `packages/cli-ts/schema/` and `packages/cli-py/src/paceproof_cli/schema/`
are byte-for-byte identical to it. A parity test in each package's test suite
asserts its local copy matches the root file, so a change to one without the
others fails CI immediately instead of silently drifting.

## Canonical JSON and the signature

The `signature` field is an Ed25519 signature over the canonical JSON
encoding of every other field in the record (`record_id`, `issued_at`,
`provider`, `hardware`, `workload_type`, `compute_amount`, `compute_unit`,
`issuer_public_key`). Canonical JSON here means: object keys sorted
lexicographically (bytewise), UTF-8 encoding, no insignificant whitespace,
numbers rendered without a leading `+` or unnecessary trailing zeros. Both
implementations produce byte-identical canonical JSON for the same record so
a signature verified by one implementation verifies under the other.

## Adapters

`ingest` normalizes arbitrary input into the canonical schema through a
pluggable adapter interface (`Adapter` in TypeScript, an ABC in Python). The
only adapter shipped in v0.1 is `jsonl`, which reads newline-delimited JSON
already in canonical form -- this is intentionally the simplest possible
adapter so the interface itself, not `jsonl`'s internals, is what a future
provider-specific adapter (e.g. for ComputeLedger's native export format)
would implement against. Adding a new adapter never requires touching
`aggregator.ts`/`aggregator.py`, `report.ts`/`report.py`, or the CLI wiring
beyond registering the new adapter name.

## Verified vs. unverified (non-negotiable)

`aggregator.ts`/`aggregator.py` always partitions records into two disjoint
sets -- verified (schema-valid AND signature-valid) and unverified (missing,
malformed, or invalid signature, or a schema violation). Aggregate totals
(compute amount by provider, by workload type, by time window) are computed
separately for each set and never merged. Both human-readable and `--json`
report output surface both counts and both totals side by side; there is no
code path that folds an unverified record into a "verified" total.

## MCP server

`paceproof mcp` starts a Model Context Protocol server (via
`@modelcontextprotocol/sdk` in the TypeScript package) exposing `verify`,
`ingest`, and `report` as callable tools, using the exact same underlying
logic the CLI commands call -- the MCP tool handlers are thin wrappers around
the same `aggregator`/`report` functions, not a reimplementation. The Python
package does not ship a second MCP server; `paceproof mcp` is a TypeScript-only
command in v0.1 (see README for the current scope note).

## No network calls by default

Every command operates on local files unless the user explicitly runs
`ingest <url>` with a URL argument -- that is the one deliberate, opt-in
network call in the whole tool. Nothing else in PaceProof makes an outbound
request, and `dashboard` output never loads an external asset.
