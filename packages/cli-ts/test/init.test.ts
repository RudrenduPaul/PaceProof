import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffoldExample } from '../src/init.js';
import { verifyRecords, summarize } from '../src/aggregator.js';
import type { RawRecord } from '../src/types.js';

describe('scaffoldExample', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('creates a keypair, a records file, and a README', () => {
    dir = join(mkdtempSync(join(tmpdir(), 'paceproof-init-')), 'example');
    const result = scaffoldExample(dir);
    expect(existsSync(result.keypairFile)).toBe(true);
    expect(existsSync(result.recordsFile)).toBe(true);
    expect(existsSync(result.readmeFile)).toBe(true);
  });

  it('produces exactly 3 valid and 4 intentionally invalid example records', () => {
    dir = join(mkdtempSync(join(tmpdir(), 'paceproof-init-')), 'example');
    const result = scaffoldExample(dir);
    const lines = readFileSync(result.recordsFile, 'utf-8').trim().split('\n');
    const records: RawRecord[] = lines.map((l) => JSON.parse(l) as RawRecord);
    expect(records).toHaveLength(7);

    const summary = summarize(verifyRecords(records));
    expect(summary.verified_count).toBe(3);
    expect(summary.unverified_count).toBe(4);
  });

  it('refuses to overwrite an existing directory', () => {
    dir = join(mkdtempSync(join(tmpdir(), 'paceproof-init-')), 'example');
    scaffoldExample(dir);
    expect(() => scaffoldExample(dir)).toThrow(/already exists/);
  });
});
