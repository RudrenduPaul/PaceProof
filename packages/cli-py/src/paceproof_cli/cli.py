"""paceproof CLI entry point (Python implementation).

Same commands, same --json output shape as the TypeScript implementation --
see ARCHITECTURE.md's "Parity" engineering standard. `mcp` is
the one exception: it is a TypeScript-only command in v0.1 (see
ARCHITECTURE.md's "MCP server" section) -- this package's `mcp` subcommand
exists only to give a clear, honest error rather than silently doing nothing.
"""

from __future__ import annotations

import json
import sys
from typing import Any

import click

from . import __version__
from .adapters import get_adapter
from .dashboard import render_dashboard_html
from .init import scaffold_example
from .report import build_report, render_human_readable
from .types import RawRecord

VERSION = __version__


def _read_records(path: str, adapter_name: str) -> list[RawRecord]:
    adapter = get_adapter(adapter_name)
    return adapter.read(path)


@click.group()
@click.version_option(VERSION, prog_name="paceproof")
def main() -> None:
    """Verify Ed25519-signed compute-attestation records and report what compute was
    actually run, by whom, and whether every signature checks out. PaceProof only
    reads and verifies already-signed records -- it does not sign or generate
    attestations.
    """


@main.command()
@click.argument("path", default="./paceproof-example")
def init(path: str) -> None:
    """Scaffold an example directory with a sample keypair and validly/invalidly signed example records."""
    try:
        result = scaffold_example(path)
    except FileExistsError as exc:
        click.echo(f"paceproof init: {exc}", err=True)
        sys.exit(1)
    click.echo(f"Created example data at {result.target_dir}")
    click.echo(f"  {result.keypair_file}")
    click.echo(f"  {result.records_file}")
    click.echo(f"  {result.readme_file}")
    click.echo(f"\nTry: paceproof report {result.target_dir}")


@main.command()
@click.argument("path")
@click.option("--json", "as_json", is_flag=True, help="output structured JSON instead of a human-readable table")
@click.option("--adapter", default="jsonl", help="adapter to use for reading input")
def verify(path: str, as_json: bool, adapter: str) -> None:
    """Verify Ed25519 signatures on every record found at PATH."""
    try:
        records = _read_records(path, adapter)
        report = build_report(path, records)
    except Exception as exc:  # noqa: BLE001
        click.echo(f"paceproof verify: {exc}", err=True)
        sys.exit(2)

    if as_json:
        payload: dict[str, Any] = {
            "source": report["source"],
            "verified_count": report["summary"]["verified_count"],
            "unverified_count": report["summary"]["unverified_count"],
            "unverified_reasons": report["summary"]["unverified_reasons"],
        }
        click.echo(json.dumps(payload, indent=2))
    else:
        click.echo(f"Verified: {report['summary']['verified_count']}")
        click.echo(f"Unverified: {report['summary']['unverified_count']}")
        for entry in report["summary"]["unverified_reasons"]:
            record_id = entry["record_id"] or "(no record_id)"
            click.echo(f"  FAIL {record_id}: {entry['reason']}")

    if report["summary"]["unverified_count"] > 0:
        sys.exit(1)


@main.command()
@click.argument("path_or_url")
@click.option("--adapter", default="jsonl", help="adapter to use")
@click.option("--out", "out_file", default=None, help="write JSONL output to a file instead of stdout")
def ingest(path_or_url: str, adapter: str, out_file: str | None) -> None:
    """Run a named adapter over the input and emit normalized canonical-schema records as JSONL."""
    try:
        records = _read_records(path_or_url, adapter)
    except Exception as exc:  # noqa: BLE001
        click.echo(f"paceproof ingest: {exc}", err=True)
        sys.exit(2)

    jsonl = "\n".join(json.dumps(r) for r in records) + ("\n" if records else "")
    if out_file:
        with open(out_file, "w", encoding="utf-8") as f:
            f.write(jsonl)
        click.echo(f"Wrote {len(records)} record(s) to {out_file}")
    else:
        click.echo(jsonl, nl=False)


@main.command()
@click.argument("path")
@click.option("--json", "as_json", is_flag=True, help="output structured JSON instead of a human-readable table")
@click.option("--adapter", default="jsonl", help="adapter to use for reading input")
def report(path: str, as_json: bool, adapter: str) -> None:
    """Ingest and verify records at PATH, then aggregate into a summary report."""
    try:
        records = _read_records(path, adapter)
        result = build_report(path, records)
    except Exception as exc:  # noqa: BLE001
        click.echo(f"paceproof report: {exc}", err=True)
        sys.exit(2)

    if as_json:
        click.echo(json.dumps(result, indent=2))
    else:
        click.echo(render_human_readable(result))


@main.command()
@click.argument("path")
@click.option("--out", default="paceproof-dashboard.html", help="output HTML file path")
@click.option("--adapter", default="jsonl", help="adapter to use for reading input")
def dashboard(path: str, out: str, adapter: str) -> None:
    """Render a single self-contained static HTML dashboard from a report."""
    try:
        records = _read_records(path, adapter)
        result = build_report(path, records)
        html_output = render_dashboard_html(result)
    except Exception as exc:  # noqa: BLE001
        click.echo(f"paceproof dashboard: {exc}", err=True)
        sys.exit(2)

    with open(out, "w", encoding="utf-8") as f:
        f.write(html_output)
    click.echo(f"Wrote dashboard to {out}")


@main.command()
def mcp() -> None:
    """Not implemented in the Python package -- use the TypeScript package's `paceproof mcp`."""
    click.echo(
        "paceproof mcp: not implemented in paceproof-cli (Python). "
        "The MCP server ships in the TypeScript package (npm install -g paceproof-cli) in v0.1.",
        err=True,
    )
    sys.exit(1)


if __name__ == "__main__":
    main()
