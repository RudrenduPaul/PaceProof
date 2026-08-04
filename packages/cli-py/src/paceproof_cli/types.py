"""Shared type definitions for the PaceProof Python implementation.

Mirrors packages/cli-ts/src/types.ts field-for-field so both implementations
produce structurally identical --json output for the same input.
"""

from __future__ import annotations

from typing import Any, Literal, TypedDict

WorkloadType = Literal["inference", "training", "idle", "unknown"]

RawRecord = dict[str, Any]


class AttestationRecord(TypedDict):
    record_id: str
    issued_at: str
    provider: str
    hardware: str
    workload_type: str
    compute_amount: float
    compute_unit: str
    issuer_public_key: str
    signature: str


class VerifiedOutcome(TypedDict):
    valid: Literal[True]
    record: AttestationRecord


class UnverifiedOutcome(TypedDict):
    valid: Literal[False]
    record: RawRecord
    reason: str


VerificationOutcome = VerifiedOutcome | UnverifiedOutcome


class AggregateBucket(TypedDict):
    record_count: int
    compute_amount_total: float
    compute_unit: str


class ProviderBucket(TypedDict):
    verified: list[AggregateBucket]
    unverified_count: int


class UnverifiedReason(TypedDict):
    record_id: str | None
    reason: str


class ReportSummary(TypedDict):
    verified_count: int
    unverified_count: int
    verified_compute_total_by_unit: dict[str, float]
    unverified_compute_total_by_unit: dict[str, float]
    by_provider: dict[str, ProviderBucket]
    by_workload_type: dict[str, ProviderBucket]
    unverified_reasons: list[UnverifiedReason]


class UnverifiedRecordEntry(TypedDict):
    record: RawRecord
    reason: str


class Report(TypedDict):
    generated_at: str
    source: str
    summary: ReportSummary
    verified_records: list[AttestationRecord]
    unverified_records: list[UnverifiedRecordEntry]
