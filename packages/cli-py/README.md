# paceproof-cli (Python)

Python implementation of `paceproof-cli` -- verifies Ed25519-signed
compute-attestation records and reports what compute was actually run, by
whom, and whether every signature checks out. A genuine reimplementation of
the schema validator, Ed25519 verifier, aggregator, and report renderer that
ship in the npm package of the same name -- not a subprocess wrapper.

See the [repo root README](https://github.com/RudrenduPaul/PaceProof#readme)
and [ARCHITECTURE.md](https://github.com/RudrenduPaul/PaceProof/blob/main/ARCHITECTURE.md)
for the full quickstart, CLI reference, and design notes.

## Install

```
pip install paceproof-cli
```

## Quickstart

```
paceproof init
paceproof report ./paceproof-example
```

## Scope note

`paceproof mcp` is not implemented in this package in v0.1 -- the MCP server
ships in the npm package (`npm install -g paceproof-cli`). Every other
command (`init`, `verify`, `ingest`, `report`, `dashboard`) is a full,
independent Python implementation with the same `--json` output shape as the
TypeScript package.
