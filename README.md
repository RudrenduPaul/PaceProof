# PaceProof

PaceProof is a CLI and MCP server that ingests, verifies, and reports on
Ed25519-signed compute-attestation records from any provider. Point it at a
directory or URL of signed records and it tells you, verifiably, what
compute was actually run, by whom, and whether every record's signature
checks out.

PaceProof does not sign or generate attestations itself. It is a neutral,
read-only ingest/verify/report/dashboard layer over records that are already
signed somewhere else. A record with a missing, malformed, or invalid
signature is never silently folded into a "verified" total -- verified and
unverified counts and compute totals are always kept separate, in both
human-readable and `--json` output.

There is no real regulatory or treaty backing behind this tool, and it does
not claim any. It is a cryptographic verification and reporting utility,
useful today for internal audit trails and cross-provider usage
transparency.

## Install

Two independent, real implementations ship with identical behavior and
`--json` output: an npm package (TypeScript, includes the MCP server) and a
PyPI package (Python, a genuine reimplementation, not a subprocess wrapper).

```
npm install -g paceproof-cli
```

or

```
pip install paceproof-cli
```

## Quickstart

```
paceproof init
paceproof report ./paceproof-example
```

`paceproof init` generates a fresh Ed25519 example keypair and 7 example
attestation records: 3 validly signed, and 4 intentionally broken (a
tampered payload, a wrong-key signature, a malformed signature, and a
missing signature) so `verify`/`report` have real failure modes to
demonstrate against, not just a happy path.

```
$ paceproof report ./paceproof-example

PaceProof report -- source: ./paceproof-example
generated at: 2026-08-03T19:11:41.819Z

== VERIFIED ==
  records: 3
  compute total: 144.50 gpu_hours

== UNVERIFIED (never counted in verified totals above) ==
  records: 4
  compute total: 1009 gpu_hours
  reasons:
    - rec-004: signature does not match record contents
    - rec-005: signature does not match record contents
    - rec-006: signature must decode to 64 bytes, got 4
    - rec-007: schema validation failed: (root) must have required property 'signature'
```

## Commands

- `paceproof init [path]` -- scaffold an example directory with a sample
  keypair and signed/broken example records.
- `paceproof verify <path>` -- verify Ed25519 signatures on every record
  found at `<path>`. `--json` for structured output.
- `paceproof ingest <path-or-url> [--adapter <name>]` -- run a named adapter
  over the input, emit normalized canonical-schema records as JSONL.
- `paceproof report <path>` -- ingest and verify in one pass, aggregate into
  a summary: totals by provider, by workload type, verified vs. unverified
  kept separate. `--json` for structured output.
- `paceproof dashboard <path> [--out <file.html>]` -- render a single
  self-contained static HTML dashboard (no external requests).
- `paceproof mcp` -- start an MCP server exposing `verify`, `ingest`, and
  `report` as callable tools (TypeScript package only in v0.1).

Every command supports `--json`/structured output where relevant, real
non-zero exit codes on failure or verification failure, and accurate
`--help` text.

## The canonical attestation record

```json
{
  "record_id": "rec-001",
  "issued_at": "2026-01-01T00:00:00.000Z",
  "provider": "acme-cloud",
  "hardware": "8xH100-SXM5",
  "workload_type": "training",
  "compute_amount": 128,
  "compute_unit": "gpu_hours",
  "issuer_public_key": "base64-ed25519-public-key",
  "signature": "base64-ed25519-signature"
}
```

The full JSON Schema lives at `schema/attestation-record.schema.json` and is
the single source of truth both implementations validate against. See
[ARCHITECTURE.md](./ARCHITECTURE.md) for the canonicalization rules the
signature is computed over, the adapter interface, and the repo layout.

## Why this exists

Compute usage claims from AI labs, cloud providers, and infrastructure
operators are getting harder to verify independently as the volume of
compute-related discourse grows -- see the real 2026 "Pacing the Frontier"
open letter for one example of the industry conversation this is motivated
by (cited here only as context, not as an endorsement or partnership).
PaceProof does not solve compute governance. It solves one narrow, concrete
piece of it: given a set of records someone claims are signed, tell me
exactly which ones actually verify, and total up only the ones that do.

## License

MIT. See [LICENSE](./LICENSE).
