export type WorkloadType = 'inference' | 'training' | 'idle' | 'unknown';

/** A record that has already passed JSON Schema validation. */
export interface AttestationRecord {
  record_id: string;
  issued_at: string;
  provider: string;
  hardware: string;
  workload_type: WorkloadType;
  compute_amount: number;
  compute_unit: string;
  issuer_public_key: string;
  signature: string;
}

/** A record fed in from an adapter before schema validation has run. */
export type RawRecord = Record<string, unknown>;

export interface VerifiedOutcome {
  valid: true;
  record: AttestationRecord;
}

export interface UnverifiedOutcome {
  valid: false;
  record: RawRecord;
  reason: string;
}

export type VerificationOutcome = VerifiedOutcome | UnverifiedOutcome;

export interface AggregateBucket {
  record_count: number;
  compute_amount_total: number;
  compute_unit: string;
}

export interface ReportSummary {
  verified_count: number;
  unverified_count: number;
  verified_compute_total_by_unit: Record<string, number>;
  unverified_compute_total_by_unit: Record<string, number>;
  by_provider: Record<string, { verified: AggregateBucket[]; unverified_count: number }>;
  by_workload_type: Record<string, { verified: AggregateBucket[]; unverified_count: number }>;
  unverified_reasons: Array<{ record_id: string | null; reason: string }>;
}

export interface Report {
  generated_at: string;
  source: string;
  summary: ReportSummary;
  verified_records: AttestationRecord[];
  unverified_records: Array<{ record: RawRecord; reason: string }>;
}
