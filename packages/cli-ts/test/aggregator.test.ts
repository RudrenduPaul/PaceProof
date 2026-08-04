import { describe, it, expect } from 'vitest';
import { generateKeypair, signRecordForExample } from '../src/crypto.js';
import { verifyRecord, verifyRecords, summarize } from '../src/aggregator.js';
import type { AttestationRecord, RawRecord } from '../src/types.js';

function makeSigned(
  keypairPrivateKey: string,
  overrides: Partial<Omit<AttestationRecord, 'signature'>> = {},
): RawRecord {
  const unsigned = {
    record_id: 'rec-1',
    issued_at: '2026-01-01T00:00:00.000Z',
    provider: 'acme-cloud',
    hardware: '8xH100-SXM5',
    workload_type: 'training' as const,
    compute_amount: 10,
    compute_unit: 'gpu_hours',
    issuer_public_key: '',
    ...overrides,
  };
  const signature = signRecordForExample(unsigned, keypairPrivateKey);
  return { ...unsigned, signature };
}

describe('verifyRecord', () => {
  it('marks a valid record as verified', () => {
    const keypair = generateKeypair();
    const raw = makeSigned(keypair.privateKeyBase64, { issuer_public_key: keypair.publicKeyBase64 });
    const outcome = verifyRecord(raw);
    expect(outcome.valid).toBe(true);
  });

  it('marks a schema-invalid record as unverified with a schema reason', () => {
    const outcome = verifyRecord({ record_id: 'incomplete' });
    expect(outcome.valid).toBe(false);
    if (!outcome.valid) {
      expect(outcome.reason).toMatch(/schema validation failed/);
    }
  });

  it('marks a tampered record as unverified', () => {
    const keypair = generateKeypair();
    const raw = makeSigned(keypair.privateKeyBase64, {
      issuer_public_key: keypair.publicKeyBase64,
      compute_amount: 10,
    });
    const tampered = { ...raw, compute_amount: 5000 };
    const outcome = verifyRecord(tampered);
    expect(outcome.valid).toBe(false);
  });
});

describe('summarize', () => {
  it('keeps verified and unverified totals completely separate', () => {
    const keypair = generateKeypair();
    const good1 = makeSigned(keypair.privateKeyBase64, {
      record_id: 'good-1',
      issuer_public_key: keypair.publicKeyBase64,
      compute_amount: 10,
      provider: 'acme-cloud',
    });
    const good2 = makeSigned(keypair.privateKeyBase64, {
      record_id: 'good-2',
      issuer_public_key: keypair.publicKeyBase64,
      compute_amount: 5,
      provider: 'acme-cloud',
    });
    const bad = { record_id: 'bad-1', provider: 'acme-cloud', compute_amount: 1000, compute_unit: 'gpu_hours' };

    const outcomes = verifyRecords([good1, good2, bad]);
    const summary = summarize(outcomes);

    expect(summary.verified_count).toBe(2);
    expect(summary.unverified_count).toBe(1);
    expect(summary.verified_compute_total_by_unit['gpu_hours']).toBe(15);
    // The unverified record's 1000 must never leak into the verified total.
    expect(summary.verified_compute_total_by_unit['gpu_hours']).not.toBe(1015);
    expect(summary.unverified_compute_total_by_unit['gpu_hours']).toBe(1000);
    expect(summary.by_provider['acme-cloud']?.unverified_count).toBe(1);
    expect(summary.unverified_reasons).toHaveLength(1);
    expect(summary.unverified_reasons[0]?.record_id).toBe('bad-1');
  });

  it('produces an empty summary for zero records', () => {
    const summary = summarize([]);
    expect(summary.verified_count).toBe(0);
    expect(summary.unverified_count).toBe(0);
    expect(summary.verified_compute_total_by_unit).toEqual({});
    expect(summary.by_provider).toEqual({});
  });

  it('aggregates by workload_type independently of provider', () => {
    const keypair = generateKeypair();
    const training = makeSigned(keypair.privateKeyBase64, {
      record_id: 'r1',
      issuer_public_key: keypair.publicKeyBase64,
      workload_type: 'training',
      compute_amount: 8,
    });
    const inference = makeSigned(keypair.privateKeyBase64, {
      record_id: 'r2',
      issuer_public_key: keypair.publicKeyBase64,
      workload_type: 'inference',
      compute_amount: 3,
    });
    const summary = summarize(verifyRecords([training, inference]));
    expect(summary.by_workload_type['training']?.verified[0]?.compute_amount_total).toBe(8);
    expect(summary.by_workload_type['inference']?.verified[0]?.compute_amount_total).toBe(3);
  });
});
