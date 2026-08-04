"""Cross-implementation parity: the Python and TypeScript CLIs must produce
structurally identical `report --json` output for the same fixture input.

This is the concrete test the project's parity engineering standard requires:
a divergence between the two implementations is a shippable bug, not a
documentation footnote. It runs the real built TypeScript CLI as a
subprocess (packages/cli-ts/dist/bin.js) and compares its report against the
Python implementation's own report on the same fixture file -- every field
except `generated_at` (a timestamp, expected to differ run to run) must
match exactly, with one narrow, deliberate exception: schema-validation
error message *text*. That text comes straight from ajv (TS) vs. jsonschema
(Python) -- two independent third-party libraries with different English
phrasing for the same violation (e.g. "must have required property
'signature'" vs. "'signature' is a required property"). Everything that
actually drives behavior -- valid/invalid, verified/unverified counts,
compute totals, which record_id failed and why category of failure --
matches exactly; only the free-text tail of schema-validation reasons is
normalized before comparing. Ed25519 signature-verification reasons (written
by our own crypto.py/crypto.ts, not a third-party library) are never
normalized and must match verbatim.

Requires `npm run build` to have already run in packages/cli-ts (the CI
pipeline's cross-language-parity job does this before invoking pytest -- see
.github/workflows/ci.yml).
"""

from __future__ import annotations

import copy
import json
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

import pytest

from paceproof_cli.adapters import get_adapter
from paceproof_cli.report import build_report

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE = REPO_ROOT / "fixtures" / "parity" / "records.jsonl"
TS_BIN = REPO_ROOT / "packages" / "cli-ts" / "dist" / "bin.js"

_SCHEMA_REASON_PREFIX = re.compile(r"^schema validation failed: .*$")


def _normalize(node: Any) -> Any:
    if isinstance(node, dict):
        normalized = {}
        for key, value in node.items():
            if key == "reason" and isinstance(value, str) and _SCHEMA_REASON_PREFIX.match(value):
                normalized[key] = "schema validation failed"
            else:
                normalized[key] = _normalize(value)
        return normalized
    if isinstance(node, list):
        return [_normalize(item) for item in node]
    return node


def _strip_volatile(report: dict) -> dict:
    stripped = copy.deepcopy(report)
    stripped.pop("generated_at", None)
    return _normalize(stripped)


_TS_NOT_BUILT_REASON = "packages/cli-ts/dist/bin.js not built -- run `npm run build` first"


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
@pytest.mark.skipif(not TS_BIN.exists(), reason=_TS_NOT_BUILT_REASON)
def test_report_json_matches_typescript_implementation() -> None:
    assert FIXTURE.exists(), f"shared parity fixture missing: {FIXTURE}"

    ts_result = subprocess.run(
        ["node", str(TS_BIN), "report", str(FIXTURE), "--json"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert ts_result.returncode == 0, f"TypeScript CLI failed: {ts_result.stderr}"
    ts_report = json.loads(ts_result.stdout)

    records = get_adapter("jsonl").read(str(FIXTURE))
    py_report = build_report(str(FIXTURE), records)

    assert _strip_volatile(ts_report) == _strip_volatile(dict(py_report)), (
        "Python and TypeScript report --json output diverged on the shared parity fixture"
    )

    # Sanity: this fixture is specifically built to exercise every failure
    # mode -- if these numbers ever drift the fixture itself was edited
    # without updating this test's expectations.
    assert ts_report["summary"]["verified_count"] == 3
    assert ts_report["summary"]["unverified_count"] == 4
