import { describe, it, expect } from 'vitest';
import { generateKeypair, signRecordForExample } from '../src/crypto.js';
import { buildReport, renderHumanReadable } from '../src/report.js';

describe('buildReport + renderHumanReadable', () => {
  it('renders verified and unverified as visually separate sections', () => {
    const keypair = generateKeypair();
    const unsigned = {
      record_id: 'r1',
      issued_at: '2026-01-01T00:00:00.000Z',
      provider: 'acme-cloud',
      hardware: '8xH100-SXM5',
      workload_type: 'training' as const,
      compute_amount: 10,
      compute_unit: 'gpu_hours',
      issuer_public_key: keypair.publicKeyBase64,
    };
    const signature = signRecordForExample(unsigned, keypair.privateKeyBase64);
    const good = { ...unsigned, signature };
    const bad = { record_id: 'r2' };

    const report = buildReport('test-source', [good, bad]);
    expect(report.summary.verified_count).toBe(1);
    expect(report.summary.unverified_count).toBe(1);

    const text = renderHumanReadable(report);
    expect(text).toContain('== VERIFIED ==');
    expect(text).toContain('== UNVERIFIED');
    expect(text.indexOf('== VERIFIED ==')).toBeLessThan(text.indexOf('== UNVERIFIED'));
  });

  it('handles an empty input set', () => {
    const report = buildReport('empty-source', []);
    expect(report.summary.verified_count).toBe(0);
    expect(report.summary.unverified_count).toBe(0);
    const text = renderHumanReadable(report);
    expect(text).toContain('(none)');
  });
});
