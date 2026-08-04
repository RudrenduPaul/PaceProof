import { validateAttestationRecord } from './schema.js';
import { verifyRecordSignature } from './crypto.js';
import type {
  AttestationRecord,
  RawRecord,
  VerificationOutcome,
  AggregateBucket,
  ReportSummary,
} from './types.js';

/**
 * Validates schema + Ed25519 signature for one raw record. A record fails
 * into "unverified" for any of: schema violation, malformed signature,
 * wrong-key signature, or tampered-payload signature. This function never
 * throws -- every failure mode becomes a VerificationOutcome with a reason.
 */
export function verifyRecord(raw: RawRecord): VerificationOutcome {
  const schemaResult = validateAttestationRecord(raw);
  if (!schemaResult.valid) {
    return { valid: false, record: raw, reason: `schema validation failed: ${schemaResult.errors.join('; ')}` };
  }

  const record = raw as unknown as AttestationRecord;
  const sigResult = verifyRecordSignature(record);
  if (!sigResult.valid) {
    return { valid: false, record: raw, reason: sigResult.reason ?? 'signature verification failed' };
  }

  return { valid: true, record };
}

export function verifyRecords(raws: RawRecord[]): VerificationOutcome[] {
  return raws.map(verifyRecord);
}

function addToBucketList(buckets: AggregateBucket[], unit: string, amount: number): void {
  const existing = buckets.find((b) => b.compute_unit === unit);
  if (existing) {
    existing.record_count += 1;
    existing.compute_amount_total += amount;
  } else {
    buckets.push({ compute_unit: unit, record_count: 1, compute_amount_total: amount });
  }
}

/**
 * Builds the report summary from verification outcomes. Verified and
 * unverified totals are computed from disjoint arrays and never merged --
 * this is a hard security invariant, enforced structurally by never adding
 * an unverified record's compute_amount to any verified_* accumulator
 * anywhere in this function.
 */
export function summarize(outcomes: VerificationOutcome[]): ReportSummary {
  const verified = outcomes.filter((o): o is Extract<VerificationOutcome, { valid: true }> => o.valid);
  const unverified = outcomes.filter((o): o is Extract<VerificationOutcome, { valid: false }> => !o.valid);

  // Every key below (compute_unit, provider, workload_type) comes straight
  // from attacker/issuer-controlled record content -- some of it (provider,
  // compute_unit) never even has to pass signature verification, since
  // unverified records are aggregated too. A plain `{}` object literal
  // inherits from Object.prototype, so a record with e.g.
  // `"provider": "__proto__"` would resolve `byProvider["__proto__"]` to the
  // live Object.prototype object instead of a fresh bucket, and the
  // `.unverified_count += 1` a few lines down would then write a new
  // enumerable `unverified_count` property directly onto Object.prototype --
  // a real, process-wide CWE-1321 prototype-pollution bug, not merely a
  // crash. Object.create(null) gives each map no prototype at all, so
  // "__proto__"/"constructor"/"prototype" behave as ordinary string keys.
  const verifiedComputeTotalByUnit: Record<string, number> = Object.create(null) as Record<string, number>;
  const unverifiedComputeTotalByUnit: Record<string, number> = Object.create(null) as Record<string, number>;
  const byProvider: ReportSummary['by_provider'] = Object.create(null) as ReportSummary['by_provider'];
  const byWorkloadType: ReportSummary['by_workload_type'] = Object.create(null) as ReportSummary['by_workload_type'];

  for (const outcome of verified) {
    const r = outcome.record;
    verifiedComputeTotalByUnit[r.compute_unit] = (verifiedComputeTotalByUnit[r.compute_unit] ?? 0) + r.compute_amount;

    byProvider[r.provider] ??= { verified: [], unverified_count: 0 };
    const providerBucket = byProvider[r.provider];
    if (providerBucket) addToBucketList(providerBucket.verified, r.compute_unit, r.compute_amount);

    byWorkloadType[r.workload_type] ??= { verified: [], unverified_count: 0 };
    const workloadBucket = byWorkloadType[r.workload_type];
    if (workloadBucket) addToBucketList(workloadBucket.verified, r.compute_unit, r.compute_amount);
  }

  for (const outcome of unverified) {
    const raw = outcome.record;
    const unit = typeof raw.compute_unit === 'string' ? raw.compute_unit : 'unknown_unit';
    const amount = typeof raw.compute_amount === 'number' ? raw.compute_amount : 0;
    unverifiedComputeTotalByUnit[unit] = (unverifiedComputeTotalByUnit[unit] ?? 0) + amount;

    const provider = typeof raw.provider === 'string' ? raw.provider : 'unknown_provider';
    byProvider[provider] ??= { verified: [], unverified_count: 0 };
    byProvider[provider].unverified_count += 1;

    const workloadType = typeof raw.workload_type === 'string' ? raw.workload_type : 'unknown';
    byWorkloadType[workloadType] ??= { verified: [], unverified_count: 0 };
    byWorkloadType[workloadType].unverified_count += 1;
  }

  return {
    verified_count: verified.length,
    unverified_count: unverified.length,
    verified_compute_total_by_unit: verifiedComputeTotalByUnit,
    unverified_compute_total_by_unit: unverifiedComputeTotalByUnit,
    by_provider: byProvider,
    by_workload_type: byWorkloadType,
    unverified_reasons: unverified.map((o) => ({
      record_id: typeof o.record.record_id === 'string' ? o.record.record_id : null,
      reason: o.reason,
    })),
  };
}
