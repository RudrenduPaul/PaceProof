import type { Report } from './types.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? n.toString() : n.toFixed(2);
}

interface ProviderTotal {
  provider: string;
  total: number;
  unit: string;
}

function providerTotals(report: Report): ProviderTotal[] {
  const totals: ProviderTotal[] = [];
  for (const [provider, data] of Object.entries(report.summary.by_provider)) {
    for (const bucket of data.verified) {
      totals.push({ provider, total: bucket.compute_amount_total, unit: bucket.compute_unit });
    }
  }
  return totals.sort((a, b) => b.total - a.total);
}

/**
 * Renders a report as a single self-contained static HTML file: inline CSS,
 * inline JS-free bar visualization (pure CSS widths), no external requests
 * of any kind (no CDN fonts, no external scripts, no remote images). v0.1
 * ships a single clean light theme -- no dark-mode toggle yet.
 */
export function renderDashboardHtml(report: Report): string {
  const totals = providerTotals(report);
  const maxTotal = Math.max(1, ...totals.map((t) => t.total));

  const barsHtml = totals
    .map((t) => {
      const pct = Math.max(2, Math.round((t.total / maxTotal) * 100));
      return `
        <div class="bar-row">
          <div class="bar-label">${escapeHtml(t.provider)}</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${pct}%"></div>
          </div>
          <div class="bar-value">${escapeHtml(fmtNum(t.total))} ${escapeHtml(t.unit)}</div>
        </div>`;
    })
    .join('\n');

  const unverifiedRowsHtml = report.summary.unverified_reasons
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.record_id ?? '(no record_id)')}</td><td>${escapeHtml(r.reason)}</td></tr>`,
    )
    .join('\n');

  const verifiedUnitsHtml = Object.entries(report.summary.verified_compute_total_by_unit)
    .map(([unit, total]) => `<tr><td>${escapeHtml(unit)}</td><td>${escapeHtml(fmtNum(total))}</td></tr>`)
    .join('\n');

  const unverifiedUnitsHtml = Object.entries(report.summary.unverified_compute_total_by_unit)
    .map(([unit, total]) => `<tr><td>${escapeHtml(unit)}</td><td>${escapeHtml(fmtNum(total))}</td></tr>`)
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PaceProof report -- ${escapeHtml(report.source)}</title>
<style>
  :root {
    color-scheme: light;
    --bg: #f7f7fa;
    --panel: #ffffff;
    --border: #e2e2e8;
    --text: #1a1a24;
    --muted: #6b6b76;
    --verified: #2e7d5b;
    --unverified: #b3452e;
    --accent: #3b5bdb;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 2rem;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.5;
  }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  .meta { color: var(--muted); font-size: 0.9rem; margin-bottom: 1.5rem; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  .panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.25rem;
  }
  .panel h2 { margin: 0 0 0.75rem; font-size: 1.05rem; }
  .stat { font-size: 2rem; font-weight: 600; }
  .stat.verified { color: var(--verified); }
  .stat.unverified { color: var(--unverified); }
  .stat-label { color: var(--muted); font-size: 0.85rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 500; }
  .bar-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.6rem; }
  .bar-label { width: 140px; flex-shrink: 0; font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-track { flex: 1; background: var(--border); border-radius: 4px; height: 14px; overflow: hidden; }
  .bar-fill { background: var(--accent); height: 100%; }
  .bar-value { width: 130px; flex-shrink: 0; font-size: 0.8rem; color: var(--muted); text-align: right; }
  .empty { color: var(--muted); font-style: italic; }
  footer { margin-top: 2rem; color: var(--muted); font-size: 0.8rem; }
</style>
</head>
<body>
  <h1>PaceProof report</h1>
  <div class="meta">source: ${escapeHtml(report.source)} &middot; generated ${escapeHtml(report.generated_at)}</div>

  <div class="grid">
    <div class="panel">
      <h2>Verified</h2>
      <div class="stat verified">${report.summary.verified_count}</div>
      <div class="stat-label">records with a valid Ed25519 signature</div>
      <table>${verifiedUnitsHtml || '<tr><td class="empty">no verified compute totals</td></tr>'}</table>
    </div>
    <div class="panel">
      <h2>Unverified</h2>
      <div class="stat unverified">${report.summary.unverified_count}</div>
      <div class="stat-label">records excluded from verified totals</div>
      <table>${unverifiedUnitsHtml || '<tr><td class="empty">no unverified compute totals</td></tr>'}</table>
    </div>
  </div>

  <div class="panel" style="margin-bottom:1.5rem;">
    <h2>Verified compute by provider</h2>
    ${barsHtml || '<div class="empty">no verified records</div>'}
  </div>

  <div class="panel">
    <h2>Why records were excluded</h2>
    ${
      unverifiedRowsHtml
        ? `<table><thead><tr><th>record_id</th><th>reason</th></tr></thead><tbody>${unverifiedRowsHtml}</tbody></table>`
        : '<div class="empty">every record verified</div>'
    }
  </div>

  <footer>Generated by paceproof-cli. This report reflects only the records found at the given source; it is not a compliance or regulatory certification of any kind.</footer>
</body>
</html>
`;
}
