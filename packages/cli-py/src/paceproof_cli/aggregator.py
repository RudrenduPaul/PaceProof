"""Verifies and aggregates records. Mirrors packages/cli-ts/src/aggregator.ts.

Security invariant (non-negotiable, see CLAUDE.md): a record with a missing,
malformed, or invalid signature is never silently included in "verified"
aggregate totals. Verified and unverified totals are computed from disjoint
lists and never merged anywhere in this module.
"""

from __future__ import annotations

from typing import cast

from .crypto import verify_record_signature
from .schema import validate_attestation_record
from .types import (
    AggregateBucket,
    AttestationRecord,
    ProviderBucket,
    RawRecord,
    ReportSummary,
    UnverifiedOutcome,
    UnverifiedReason,
    VerificationOutcome,
    VerifiedOutcome,
)


def verify_record(raw: RawRecord) -> VerificationOutcome:
    """Validates schema + Ed25519 signature for one raw record.

    Never raises -- every failure mode becomes a VerificationOutcome with a reason.
    """
    schema_result = validate_attestation_record(raw)
    if not schema_result.valid:
        return UnverifiedOutcome(
            valid=False,
            record=raw,
            reason=f"schema validation failed: {'; '.join(schema_result.errors)}",
        )

    record = cast(AttestationRecord, raw)
    sig_result = verify_record_signature(record)
    if not sig_result.valid:
        return UnverifiedOutcome(valid=False, record=raw, reason=sig_result.reason or "signature verification failed")

    return VerifiedOutcome(valid=True, record=record)


def verify_records(raws: list[RawRecord]) -> list[VerificationOutcome]:
    return [verify_record(r) for r in raws]


def _add_to_bucket_list(buckets: list[AggregateBucket], unit: str, amount: float) -> None:
    for bucket in buckets:
        if bucket["compute_unit"] == unit:
            bucket["record_count"] += 1
            bucket["compute_amount_total"] += amount
            return
    buckets.append(AggregateBucket(compute_unit=unit, record_count=1, compute_amount_total=amount))


def summarize(outcomes: list[VerificationOutcome]) -> ReportSummary:
    verified: list[VerifiedOutcome] = [o for o in outcomes if o["valid"]]
    unverified: list[UnverifiedOutcome] = [o for o in outcomes if not o["valid"]]

    verified_compute_total_by_unit: dict[str, float] = {}
    unverified_compute_total_by_unit: dict[str, float] = {}
    by_provider: dict[str, ProviderBucket] = {}
    by_workload_type: dict[str, ProviderBucket] = {}

    for verified_outcome in verified:
        r = verified_outcome["record"]
        unit = r["compute_unit"]
        verified_compute_total_by_unit[unit] = verified_compute_total_by_unit.get(unit, 0) + r["compute_amount"]

        provider_bucket = by_provider.setdefault(r["provider"], ProviderBucket(verified=[], unverified_count=0))
        _add_to_bucket_list(provider_bucket["verified"], unit, r["compute_amount"])

        workload_bucket = by_workload_type.setdefault(
            r["workload_type"], ProviderBucket(verified=[], unverified_count=0)
        )
        _add_to_bucket_list(workload_bucket["verified"], unit, r["compute_amount"])

    for unverified_outcome in unverified:
        raw = unverified_outcome["record"]
        raw_unit = raw.get("compute_unit")
        unit = raw_unit if isinstance(raw_unit, str) else "unknown_unit"
        raw_amount = raw.get("compute_amount")
        amount = raw_amount if isinstance(raw_amount, (int, float)) else 0
        unverified_compute_total_by_unit[unit] = unverified_compute_total_by_unit.get(unit, 0) + amount

        raw_provider = raw.get("provider")
        provider = raw_provider if isinstance(raw_provider, str) else "unknown_provider"
        provider_bucket = by_provider.setdefault(provider, ProviderBucket(verified=[], unverified_count=0))
        provider_bucket["unverified_count"] += 1

        raw_workload_type = raw.get("workload_type")
        workload_type = raw_workload_type if isinstance(raw_workload_type, str) else "unknown"
        workload_bucket = by_workload_type.setdefault(
            workload_type, ProviderBucket(verified=[], unverified_count=0)
        )
        workload_bucket["unverified_count"] += 1

    unverified_reasons: list[UnverifiedReason] = []
    for unverified_outcome in unverified:
        raw_record_id = unverified_outcome["record"].get("record_id")
        unverified_reasons.append(
            UnverifiedReason(
                record_id=raw_record_id if isinstance(raw_record_id, str) else None,
                reason=unverified_outcome["reason"],
            )
        )

    return ReportSummary(
        verified_count=len(verified),
        unverified_count=len(unverified),
        verified_compute_total_by_unit=verified_compute_total_by_unit,
        unverified_compute_total_by_unit=unverified_compute_total_by_unit,
        by_provider=by_provider,
        by_workload_type=by_workload_type,
        unverified_reasons=unverified_reasons,
    )
