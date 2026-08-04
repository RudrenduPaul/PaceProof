"""Adapter interface -- PaceProof's extensibility point.

An Adapter turns some raw input (a file path, a directory, a URL) into a list
of records already normalized to the canonical attestation-record shape
(schema validation still runs downstream in the aggregator -- an adapter's
job is only field-mapping/format-parsing, not verification).

Mirrors packages/cli-ts/src/adapters/types.ts. A provider-specific adapter
(e.g. for ComputeLedger's native export format) implements this ABC without
touching aggregator.py, report.py, or the CLI wiring beyond registering the
adapter's name.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from ..types import RawRecord


class Adapter(ABC):
    name: str

    @abstractmethod
    def read(self, source: str) -> list[RawRecord]:
        """Reads and normalizes records from `source`.

        Never fetches network data unless `source` is itself a URL and the
        caller opted in.
        """
        raise NotImplementedError
