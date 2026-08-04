"""Scaffolds an example directory with a fresh keypair and example records.

Mirrors packages/cli-ts/src/init.ts field-for-field, including the same 3
validly-signed + 4 intentionally-broken record set, so both implementations'
quickstarts demonstrate the exact same verify/report behavior.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from .crypto import generate_keypair, sign_record_for_example


@dataclass
class InitResult:
    target_dir: str
    records_file: str
    keypair_file: str
    readme_file: str


def _iso_at(base: datetime, offset_minutes: int) -> str:
    dt = base + timedelta(minutes=offset_minutes)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def scaffold_example(target_dir: str) -> InitResult:
    """Scaffolds an example directory with a freshly generated Ed25519 keypair
    and a handful of example attestation records -- some validly signed, some
    intentionally broken (tampered payload, wrong key, malformed signature,
    missing signature) -- so a new user can immediately run verify/report/
    dashboard against real data.

    This keypair and these records are example data only, generated fresh on
    every init run -- never treat them as real credentials or real compute
    usage.
    """
    target = Path(target_dir)
    if target.exists():
        raise FileExistsError(
            f"{target_dir} already exists -- remove it or choose a different path before running init"
        )
    target.mkdir(parents=True)

    keypair = generate_keypair()
    wrong_keypair = generate_keypair()

    base_issued_at = datetime.now(timezone.utc)

    def iso_at(offset_minutes: int) -> str:
        return _iso_at(base_issued_at, offset_minutes)

    valid1: dict[str, Any] = {
        "record_id": "rec-001",
        "issued_at": iso_at(0),
        "provider": "acme-cloud",
        "hardware": "8xH100-SXM5",
        "workload_type": "training",
        "compute_amount": 128,
        "compute_unit": "gpu_hours",
        "issuer_public_key": keypair.public_key_base64,
    }
    valid2: dict[str, Any] = {
        "record_id": "rec-002",
        "issued_at": iso_at(10),
        "provider": "beta-compute",
        "hardware": "4xA100-80GB",
        "workload_type": "inference",
        "compute_amount": 12.5,
        "compute_unit": "gpu_hours",
        "issuer_public_key": keypair.public_key_base64,
    }
    valid3: dict[str, Any] = {
        "record_id": "rec-003",
        "issued_at": iso_at(20),
        "provider": "acme-cloud",
        "hardware": "8xH100-SXM5",
        "workload_type": "idle",
        "compute_amount": 4,
        "compute_unit": "gpu_hours",
        "issuer_public_key": keypair.public_key_base64,
    }

    records: list[dict[str, Any]] = []
    for rec in (valid1, valid2, valid3):
        signature = sign_record_for_example(rec, keypair.private_key_base64)
        records.append({**rec, "signature": signature})

    # Tampered payload: sign one compute_amount, then ship a record claiming
    # a different one.
    tampered_base: dict[str, Any] = {
        "record_id": "rec-004",
        "issued_at": iso_at(30),
        "provider": "gamma-hpc",
        "hardware": "2xH100-PCIe",
        "workload_type": "training",
        "compute_amount": 10,
        "compute_unit": "gpu_hours",
        "issuer_public_key": keypair.public_key_base64,
    }
    tampered_signature = sign_record_for_example(tampered_base, keypair.private_key_base64)
    records.append({**tampered_base, "compute_amount": 1000, "signature": tampered_signature})

    # Wrong key: signed by a different private key than the one whose public
    # key is embedded in the record.
    wrong_key_base: dict[str, Any] = {
        "record_id": "rec-005",
        "issued_at": iso_at(40),
        "provider": "gamma-hpc",
        "hardware": "2xH100-PCIe",
        "workload_type": "inference",
        "compute_amount": 6,
        "compute_unit": "gpu_hours",
        "issuer_public_key": keypair.public_key_base64,
    }
    wrong_key_signature = sign_record_for_example(wrong_key_base, wrong_keypair.private_key_base64)
    records.append({**wrong_key_base, "signature": wrong_key_signature})

    # Malformed signature: valid base64, wrong length.
    records.append(
        {
            "record_id": "rec-006",
            "issued_at": iso_at(50),
            "provider": "delta-cloud",
            "hardware": "1xL40S",
            "workload_type": "unknown",
            "compute_amount": 2,
            "compute_unit": "gpu_hours",
            "issuer_public_key": keypair.public_key_base64,
            "signature": "QUJDRA==",
        }
    )

    # Missing signature entirely: fails schema validation.
    records.append(
        {
            "record_id": "rec-007",
            "issued_at": iso_at(60),
            "provider": "delta-cloud",
            "hardware": "1xL40S",
            "workload_type": "idle",
            "compute_amount": 1,
            "compute_unit": "gpu_hours",
            "issuer_public_key": keypair.public_key_base64,
        }
    )

    records_file = target / "records.jsonl"
    records_file.write_text("\n".join(json.dumps(r) for r in records) + "\n", encoding="utf-8")

    keypair_file = target / "keypair.json"
    keypair_file.write_text(
        json.dumps(
            {
                "_comment": (
                    "Example keypair generated by `paceproof init` for demo purposes only. "
                    "Never a real credential -- do not reuse for anything real."
                ),
                "public_key": keypair.public_key_base64,
                "private_key": keypair.private_key_base64,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    readme_file = target / "README.md"
    readme_file.write_text(
        "\n".join(
            [
                "# PaceProof example data",
                "",
                "Generated by `paceproof init`. This directory contains:",
                "",
                "- `keypair.json` -- a freshly generated Ed25519 example keypair (not a real credential).",
                "- `records.jsonl` -- 7 example attestation records: 3 validly signed, and 4 intentionally",
                "  broken to demonstrate every failure mode `verify`/`report` detect:",
                "  - `rec-004`: tampered payload (compute_amount changed after signing)",
                "  - `rec-005`: signed with the wrong key",
                "  - `rec-006`: malformed signature (wrong length)",
                "  - `rec-007`: missing signature field entirely (fails schema validation)",
                "",
                "Try:",
                "",
                "```",
                "paceproof report ./paceproof-example",
                "paceproof verify ./paceproof-example/records.jsonl",
                "paceproof dashboard ./paceproof-example --out ./paceproof-example/dashboard.html",
                "```",
                "",
            ]
        ),
        encoding="utf-8",
    )

    return InitResult(
        target_dir=str(target),
        records_file=str(records_file),
        keypair_file=str(keypair_file),
        readme_file=str(readme_file),
    )
