import { describe, it, expect } from 'vitest';
import { buildReport } from '../src/report.js';
import { renderDashboardHtml } from '../src/dashboard.js';

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

  it('escapes untrusted record content to prevent HTML injection', () => {
    const report = buildReport('test', [{ record_id: '<script>alert(1)</script>' }]);
    const html = renderDashboardHtml(report);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
