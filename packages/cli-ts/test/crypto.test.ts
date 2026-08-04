import { describe, it, expect } from 'vitest';
import {
  generateKeypair,
  signRecordForExample,
  verifyRecordSignature,
  canonicalizeRecord,
} from '../src/crypto.js';
import type { AttestationRecord } from '../src/types.js';

function baseUnsigned(overrides: Partial<Omit<AttestationRecord, 'signature'>> = {}) {
  return {
    record_id: 'rec-001',
    issued_at: '2026-01-01T00:00:00.000Z',
    provider: 'acme-cloud',
    hardware: '8xH100-SXM5',
    workload_type: 'training' as const,
    compute_amount: 12.5,
    compute_unit: 'gpu_hours',
    issuer_public_key: '',
    ...overrides,
  };
}

describe('canonicalizeRecord', () => {
  it('produces stable output regardless of input key order', () => {
    const a = { record_id: 'x', provider: 'p', compute_amount: 1 };
    const b = { compute_amount: 1, record_id: 'x', provider: 'p' };
    // canonicalizeRecord only reads the fixed SIGNED_FIELDS set, so it needs
    // the full record shape -- this test just proves ordering doesn't leak
    // into the fields that are present in both.
    const full = (extra: Record<string, unknown>) => ({
      ...baseUnsigned(),
      ...extra,
    });
    const bytesA = canonicalizeRecord(full(a));
    const bytesB = canonicalizeRecord(full(b));
    expect(Buffer.from(bytesA).toString()).toBe(Buffer.from(bytesB).toString());
  });

  it('renders an integral float with no decimal point', () => {
    const bytes = canonicalizeRecord(baseUnsigned({ compute_amount: 42 }));
    expect(Buffer.from(bytes).toString()).toContain('"compute_amount":42');
  });

  it('renders a non-integral number without trailing zero padding', () => {
    const bytes = canonicalizeRecord(baseUnsigned({ compute_amount: 12.5 }));
    expect(Buffer.from(bytes).toString()).toContain('"compute_amount":12.5');
  });
});

describe('verifyRecordSignature', () => {
  it('accepts a validly signed record', () => {
    const keypair = generateKeypair();
    const unsigned = baseUnsigned({ issuer_public_key: keypair.publicKeyBase64 });
    const signature = signRecordForExample(unsigned, keypair.privateKeyBase64);
    const record: AttestationRecord = { ...unsigned, signature };
    const result = verifyRecordSignature(record);
    expect(result.valid).toBe(true);
  });

  it('rejects a tampered payload (signature does not match content)', () => {
    const keypair = generateKeypair();
    const unsigned = baseUnsigned({ issuer_public_key: keypair.publicKeyBase64, compute_amount: 10 });
    const signature = signRecordForExample(unsigned, keypair.privateKeyBase64);
    const tampered: AttestationRecord = { ...unsigned, compute_amount: 999, signature };
    const result = verifyRecordSignature(tampered);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/does not match/);
  });

  it('rejects a record signed by the wrong key', () => {
    const keypair = generateKeypair();
    const wrongKeypair = generateKeypair();
    const unsigned = baseUnsigned({ issuer_public_key: keypair.publicKeyBase64 });
    const signature = signRecordForExample(unsigned, wrongKeypair.privateKeyBase64);
    const record: AttestationRecord = { ...unsigned, signature };
    const result = verifyRecordSignature(record);
    expect(result.valid).toBe(false);
  });

  it('rejects a malformed (non-base64) signature', () => {
    const keypair = generateKeypair();
    const unsigned = baseUnsigned({ issuer_public_key: keypair.publicKeyBase64 });
    const record: AttestationRecord = { ...unsigned, signature: 'not-valid-base64!!' };
    const result = verifyRecordSignature(record);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/base64/);
  });

  it('rejects a signature of the wrong byte length', () => {
    const keypair = generateKeypair();
    const unsigned = baseUnsigned({ issuer_public_key: keypair.publicKeyBase64 });
    const record: AttestationRecord = { ...unsigned, signature: 'QUJDRA==' };
    const result = verifyRecordSignature(record);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/64 bytes/);
  });

  it('rejects a malformed (non-base64) public key', () => {
    const keypair = generateKeypair();
    const unsigned = baseUnsigned({ issuer_public_key: '***not-base64***' });
    const signature = signRecordForExample(unsigned, keypair.privateKeyBase64);
    const record: AttestationRecord = { ...unsigned, signature };
    const result = verifyRecordSignature(record);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/base64/);
  });
});
