"""Builds and renders reports. Mirrors packages/cli-ts/src/report.ts."""

from __future__ import annotations

from datetime import datetime, timezone

from .aggregator import summarize, verify_records
from .types import AggregateBucket, RawRecord, Report, UnverifiedRecordEntry


def _now_iso() -> str:
    now = datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


def build_report(source: str, raw_records: list[RawRecord]) -> Report:
    outcomes = verify_records(raw_records)
    summary = summarize(outcomes)

    verified_records = [o["record"] for o in outcomes if o["valid"]]
    unverified_records: list[UnverifiedRecordEntry] = [
        UnverifiedRecordEntry(record=o["record"], reason=o["reason"]) for o in outcomes if not o["valid"]
    ]

    return Report(
        generated_at=_now_iso(),
        source=source,
        summary=summary,
        verified_records=verified_records,
        unverified_records=unverified_records,
    )


def _fmt_num(n: float) -> str:
    return str(int(n)) if float(n).is_integer() else f"{n:.2f}"


def _format_buckets(buckets: list[AggregateBucket]) -> str:
    parts = [
        f"{_fmt_num(b['compute_amount_total'])} {b['compute_unit']} ({b['record_count']} records)"
        for b in buckets
    ]
    return ", ".join(parts) or "(none)"


def render_human_readable(report: Report) -> str:
    """Renders a report as a human-readable table.

    Always shows verified and unverified counts/totals as visually separate
    sections -- never merged.
    """
    lines: list[str] = []
    lines.append(f"PaceProof report -- source: {report['source']}")
    lines.append(f"generated at: {report['generated_at']}")
    lines.append("")
    lines.append("== VERIFIED ==")
    lines.append(f"  records: {report['summary']['verified_count']}")
    verified_units = list(report["summary"]["verified_compute_total_by_unit"].items())
    if not verified_units:
        lines.append("  compute total: (none)")
    else:
        for unit, total in verified_units:
            lines.append(f"  compute total: {_fmt_num(total)} {unit}")
    lines.append("")
    lines.append("== UNVERIFIED (never counted in verified totals above) ==")
    lines.append(f"  records: {report['summary']['unverified_count']}")
    unverified_units = list(report["summary"]["unverified_compute_total_by_unit"].items())
    if not unverified_units:
        lines.append("  compute total: (none)")
    else:
        for unit, total in unverified_units:
            lines.append(f"  compute total: {_fmt_num(total)} {unit}")
    if report["summary"]["unverified_reasons"]:
        lines.append("  reasons:")
        for entry in report["summary"]["unverified_reasons"]:
            record_id = entry["record_id"] or "(no record_id)"
            lines.append(f"    - {record_id}: {entry['reason']}")
    lines.append("")
    lines.append("== BY PROVIDER ==")
    for provider, data in report["summary"]["by_provider"].items():
        verified_str = _format_buckets(data["verified"])
        unverified_n = data["unverified_count"]
        lines.append(f"  {provider}: verified={verified_str}; unverified_count={unverified_n}")
    lines.append("")
    lines.append("== BY WORKLOAD TYPE ==")
    for workload_type, data in report["summary"]["by_workload_type"].items():
        verified_str = _format_buckets(data["verified"])
        unverified_n = data["unverified_count"]
        lines.append(f"  {workload_type}: verified={verified_str}; unverified_count={unverified_n}")
    return "\n".join(lines)
