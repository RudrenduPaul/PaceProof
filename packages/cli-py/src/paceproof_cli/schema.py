"""JSON Schema validation for attestation records.

Loads schema/attestation-record.schema.json (a copy of the repo root's single
source of truth -- see ARCHITECTURE.md) and validates raw records against it,
mirroring packages/cli-ts/src/schema.ts.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import jsonschema
from jsonschema.validators import Draft202012Validator

from .types import RawRecord

_SCHEMA_PATH = Path(__file__).resolve().parent / "schema" / "attestation-record.schema.json"

with _SCHEMA_PATH.open("r", encoding="utf-8") as _f:
    attestation_record_schema = json.load(_f)

_validator = Draft202012Validator(
    attestation_record_schema,
    format_checker=jsonschema.FormatChecker(),
)


@dataclass
class SchemaValidationResult:
    valid: bool
    errors: list[str] = field(default_factory=list)


def validate_attestation_record(record: RawRecord) -> SchemaValidationResult:
    """Validate a raw record against the canonical attestation-record schema."""
    errors = sorted(_validator.iter_errors(record), key=lambda e: list(e.path))
    if not errors:
        return SchemaValidationResult(valid=True, errors=[])

    formatted: list[str] = []
    for err in errors:
        path = "/" + "/".join(str(p) for p in err.path) if err.path else "(root)"
        formatted.append(f"{path} {err.message}")
    return SchemaValidationResult(valid=False, errors=formatted)
