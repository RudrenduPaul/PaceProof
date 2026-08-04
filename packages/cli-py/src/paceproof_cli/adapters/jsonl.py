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

# Bounds for the one network call PaceProof ever makes (`ingest <url>`),
# which fetches whatever the operator points it at -- possibly a third-party
# or compromised endpoint. Mirrors packages/cli-ts/src/adapters/jsonl.ts:
# a timeout so a hung connection can't block forever, and a body-size cap so
# an attacker-controlled or misbehaving server can't exhaust memory by
# streaming an unbounded response.
_INGEST_URL_TIMEOUT_SECONDS = 30
_INGEST_URL_MAX_BYTES = 50 * 1024 * 1024  # 50 MiB


def _read_url_with_bounds(url: str) -> str:
    with urllib.request.urlopen(url, timeout=_INGEST_URL_TIMEOUT_SECONDS) as response:  # noqa: S310
        content_length = response.headers.get("Content-Length")
        if content_length is not None and int(content_length) > _INGEST_URL_MAX_BYTES:
            raise RuntimeError(
                f"Refusing to fetch {url}: response is {content_length} bytes, "
                f"exceeds the {_INGEST_URL_MAX_BYTES}-byte limit"
            )
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > _INGEST_URL_MAX_BYTES:
                raise RuntimeError(f"Refusing to fetch {url}: response exceeded the {_INGEST_URL_MAX_BYTES}-byte limit")
            chunks.append(chunk)
        return b"".join(chunks).decode("utf-8")


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
            # invocation the user typed themselves. Bounded by timeout and
            # response size (see _read_url_with_bounds) so a slow or
            # malicious endpoint can't hang the process or exhaust memory.
            try:
                text = _read_url_with_bounds(source)
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
