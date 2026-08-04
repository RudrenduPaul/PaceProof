import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport } from '../src/report.js';
import { jsonlAdapter } from '../src/adapters/jsonl.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const fixture = join(repoRoot, 'fixtures', 'parity', 'records.jsonl');
const pythonModuleDir = join(repoRoot, 'packages', 'cli-py');

function pythonAvailable(): string | null {
  for (const candidate of ['python3', 'python']) {
    const check = spawnSync(candidate, ['--version']);
    if (check.status === 0) return candidate;
  }
  return null;
}

function pythonCliInstalled(python: string): boolean {
  const check = spawnSync(python, ['-c', 'import paceproof_cli'], { cwd: pythonModuleDir });
  return check.status === 0;
}

/**
 * Symmetric counterpart to
 * packages/cli-py/tests/test_cross_language_parity.py -- this direction
 * runs the Python CLI as a subprocess and compares its `report --json`
 * output to the TypeScript implementation's own output on the same shared
 * fixture. Skipped (not failed) when Python or the installed paceproof_cli
 * package isn't available in the current environment -- the Python test
 * suite's own parity test is the enforced source of truth in CI.
 */
describe('cross-language parity (TS report vs. Python CLI)', () => {
  let python: string | null = null;

  beforeAll(() => {
    python = pythonAvailable();
  });

  it('produces the same verified/unverified counts as the Python CLI on the shared fixture', async () => {
    if (!existsSync(fixture)) {
      throw new Error(`shared parity fixture missing: ${fixture}`);
    }
    if (!python || !pythonCliInstalled(python)) {
      // eslint-disable-next-line no-console
      console.warn('Skipping cross-language parity check: paceproof_cli is not installed in this environment.');
      return;
    }

    const pyResult = spawnSync(python, ['-m', 'paceproof_cli.cli', 'report', fixture, '--json'], {
      cwd: pythonModuleDir,
      encoding: 'utf-8',
    });
    expect(pyResult.status).toBe(0);
    const pyReport = JSON.parse(pyResult.stdout) as { summary: Record<string, unknown> };

    const records = await jsonlAdapter.read(fixture);
    const tsReport = buildReport(fixture, records);

    expect(tsReport.summary.verified_count).toBe(pyReport.summary.verified_count);
    expect(tsReport.summary.unverified_count).toBe(pyReport.summary.unverified_count);
    expect(tsReport.summary.verified_compute_total_by_unit).toEqual(pyReport.summary.verified_compute_total_by_unit);
    expect(tsReport.summary.unverified_compute_total_by_unit).toEqual(
      pyReport.summary.unverified_compute_total_by_unit,
    );
  });
});
