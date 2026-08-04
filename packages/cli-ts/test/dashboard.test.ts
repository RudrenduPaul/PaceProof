import { describe, it, expect } from 'vitest';
import { buildReport } from '../src/report.js';
import { renderDashboardHtml } from '../src/dashboard.js';
import { generateKeypair, signRecordForExample } from '../src/crypto.js';

describe('renderDashboardHtml', () => {
  it('produces a self-contained HTML document with no external requests', () => {
    const report = buildReport('test', [{ record_id: 'r1' }]);
    const html = renderDashboardHtml(report);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<style>');
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain('<script src=');
    expect(html).not.toContain('<link ');
  });

  it('escapes untrusted record content to prevent HTML injection (unverified record_id)', () => {
    const report = buildReport('test', [{ record_id: '<script>alert(1)</script>' }]);
    const html = renderDashboardHtml(report);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes untrusted content from a validly-signed record (provider, hardware, compute_unit)', () => {
    // The bars/units tables are built only from *verified* records, driven
    // by the issuer_public_key/signature the issuer themselves controls --
    // a malicious-but-validly-signed provider name must still come out escaped.
    const keypair = generateKeypair();
    const payload = '<img src=x onerror=alert(1)>';
    const unsigned = {
      record_id: 'r1',
      issued_at: '2026-01-01T00:00:00.000Z',
      provider: payload,
      hardware: payload,
      workload_type: 'training' as const,
      compute_amount: 10,
      compute_unit: payload,
      issuer_public_key: keypair.publicKeyBase64,
    };
    const signature = signRecordForExample(unsigned, keypair.privateKeyBase64);
    const report = buildReport('test', [{ ...unsigned, signature }]);
    expect(report.summary.verified_count).toBe(1);

    const html = renderDashboardHtml(report);
    expect(html).not.toContain(payload);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
