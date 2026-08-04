import { verifyRecords, summarize } from './aggregator.js';
import type { RawRecord, Report } from './types.js';

export function buildReport(source: string, rawRecords: RawRecord[]): Report {
  const outcomes = verifyRecords(rawRecords);
  const summary = summarize(outcomes);

  return {
    generated_at: new Date().toISOString(),
    source,
    summary,
    verified_records: outcomes.filter((o) => o.valid).map((o) => o.record),
    unverified_records: outcomes
      .filter((o) => !o.valid)
      .map((o) => ({ record: o.record, reason: (o as { reason: string }).reason })),
  };
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

/** Renders a report as a human-readable table. Always shows verified and unverified counts/totals as visually separate sections -- never merged. */
export function renderHumanReadable(report: Report): string {
  const lines: string[] = [];
  lines.push(`PaceProof report -- source: ${report.source}`);
  lines.push(`generated at: ${report.generated_at}`);
  lines.push('');
  lines.push('== VERIFIED ==');
  lines.push(`  records: ${report.summary.verified_count}`);
  const verifiedUnits = Object.entries(report.summary.verified_compute_total_by_unit);
  if (verifiedUnits.length === 0) {
    lines.push('  compute total: (none)');
  } else {
    for (const [unit, total] of verifiedUnits) {
      lines.push(`  compute total: ${fmtNum(total)} ${unit}`);
    }
  }
  lines.push('');
  lines.push('== UNVERIFIED (never counted in verified totals above) ==');
  lines.push(`  records: ${report.summary.unverified_count}`);
  const unverifiedUnits = Object.entries(report.summary.unverified_compute_total_by_unit);
  if (unverifiedUnits.length === 0) {
    lines.push('  compute total: (none)');
  } else {
    for (const [unit, total] of unverifiedUnits) {
      lines.push(`  compute total: ${fmtNum(total)} ${unit}`);
    }
  }
  if (report.summary.unverified_reasons.length > 0) {
    lines.push('  reasons:');
    for (const { record_id, reason } of report.summary.unverified_reasons) {
      lines.push(`    - ${record_id ?? '(no record_id)'}: ${reason}`);
    }
  }
  lines.push('');
  lines.push('== BY PROVIDER ==');
  for (const [provider, data] of Object.entries(report.summary.by_provider)) {
    const verifiedStr = data.verified
      .map((b) => `${fmtNum(b.compute_amount_total)} ${b.compute_unit} (${b.record_count} records)`)
      .join(', ') || '(none)';
    lines.push(`  ${provider}: verified=${verifiedStr}; unverified_count=${data.unverified_count}`);
  }
  lines.push('');
  lines.push('== BY WORKLOAD TYPE ==');
  for (const [workloadType, data] of Object.entries(report.summary.by_workload_type)) {
    const verifiedStr = data.verified
      .map((b) => `${fmtNum(b.compute_amount_total)} ${b.compute_unit} (${b.record_count} records)`)
      .join(', ') || '(none)';
    lines.push(`  ${workloadType}: verified=${verifiedStr}; unverified_count=${data.unverified_count}`);
  }
  return lines.join('\n');
}
