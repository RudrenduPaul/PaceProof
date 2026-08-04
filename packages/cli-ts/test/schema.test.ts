import { describe, it, expect } from 'vitest';
import { validateAttestationRecord } from '../src/schema.js';

const validRecord = {
  record_id: 'rec-001',
  issued_at: '2026-01-01T00:00:00.000Z',
  provider: 'acme-cloud',
  hardware: '8xH100-SXM5',
  workload_type: 'training',
  compute_amount: 12.5,
  compute_unit: 'gpu_hours',
  issuer_public_key: 'QUJDRA==',
  signature: 'QUJDRA==',
};

describe('validateAttestationRecord', () => {
  it('accepts a well-formed record', () => {
    const result = validateAttestationRecord(validRecord);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a record missing a required field', () => {
    const rest: Record<string, unknown> = { ...validRecord };
    delete rest.signature;
    const result = validateAttestationRecord(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('signature');
  });

  it('rejects an invalid workload_type enum value', () => {
    const result = validateAttestationRecord({ ...validRecord, workload_type: 'mining' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects a negative compute_amount', () => {
    const result = validateAttestationRecord({ ...validRecord, compute_amount: -1 });
    expect(result.valid).toBe(false);
  });

  it('rejects a non-string hardware field', () => {
    const result = validateAttestationRecord({ ...validRecord, hardware: 123 });
    expect(result.valid).toBe(false);
  });

  it('rejects an unrecognized additional property', () => {
    const result = validateAttestationRecord({ ...validRecord, unexpected_field: 'nope' });
    expect(result.valid).toBe(false);
  });

  it('rejects a malformed issued_at', () => {
    const result = validateAttestationRecord({ ...validRecord, issued_at: 'not-a-date' });
    expect(result.valid).toBe(false);
  });

  it('rejects absurdly long free-text fields instead of allowing an unbounded-memory record', () => {
    // A malicious or compromised record source (a third-party provider's
    // export, or the response to `ingest <url>`) could otherwise embed a
    // multi-megabyte string in any of these fields.
    const hugeString = 'a'.repeat(10_000_000); // 10 MB in a single field
    const result = validateAttestationRecord({ ...validRecord, provider: hugeString });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/provider/);
  });

  it('rejects an issuer_public_key/signature far longer than any real Ed25519 value', () => {
    const hugeBase64 = 'QQ=='.repeat(100); // way past the 44/88-char real lengths, still valid base64 shape
    const result = validateAttestationRecord({ ...validRecord, issuer_public_key: hugeBase64 });
    expect(result.valid).toBe(false);
  });
});
