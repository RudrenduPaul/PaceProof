"""Reference adapter: reads newline-delimited JSON records already in
canonical attestation-record shape.

Intentionally the simplest possible adapter -- it exists to demonstrate the
Adapter interface, not to do any real format translation. Mirrors
packages/cli-ts/src/adapters/jsonl.ts.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

from ..types import RawRecord
from .base import Adapter


def _parse_jsonl_text(text: str, source_label: str) -> list[RawRecord]:
    records: list[RawRecord] = []
    for i, raw_line in enumerate(text.split("\n"), start=1):
        line = raw_line.strip()
        if not line:
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError as exc:
            # A malformed line is a data-quality problem in the input, not a
            # signature/schema problem -- it never becomes a silently-dropped
            # record and never crashes the whole ingest run.
            sys.stderr.write(f"paceproof: skipping malformed JSON on {source_label}:{i}: {exc}\n")
            continue
        if not isinstance(parsed, dict):
            sys.stderr.write(f"paceproof: skipping non-object JSON line on {source_label}:{i}\n")
            continue
        records.append(parsed)
    return records


class JsonlAdapter(Adapter):
    name = "jsonl"

    def read(self, source: str) -> list[RawRecord]:
        if source.startswith("http://") or source.startswith("https://"):
            # The only network call in PaceProof: an explicit `ingest <url>`
            # invocation the user typed themselves.
            try:
                with urllib.request.urlopen(source, timeout=30) as response:  # noqa: S310
                    text = response.read().decode("utf-8")
            except urllib.error.URLError as exc:
                raise RuntimeError(f"Failed to fetch {source}: {exc}") from exc
            return _parse_jsonl_text(text, source)

        path = Path(source)
        if path.is_dir():
            records: list[RawRecord] = []
            for file_path in sorted(path.glob("*.jsonl")):
                text = file_path.read_text(encoding="utf-8")
                records.extend(_parse_jsonl_text(text, str(file_path)))
            return records

        text = path.read_text(encoding="utf-8")
        return _parse_jsonl_text(text, str(path))


jsonl_adapter = JsonlAdapter()

adapters: dict[str, Adapter] = {
    "jsonl": jsonl_adapter,
}


def get_adapter(name: str) -> Adapter:
    adapter = adapters.get(name)
    if adapter is None:
        known = ", ".join(adapters.keys())
        raise ValueError(f'Unknown adapter "{name}". Known adapters: {known}')
    return adapter
