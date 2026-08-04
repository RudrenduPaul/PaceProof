import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jsonlAdapter, getAdapter } from '../../src/adapters/jsonl.js';

describe('jsonlAdapter', () => {
  let dir: string;
  let stderrSpy: MockInstance<typeof process.stderr.write>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'paceproof-jsonl-'));
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    stderrSpy.mockRestore();
  });

  it('reads records from a single file', async () => {
    const file = join(dir, 'records.jsonl');
    writeFileSync(file, '{"a":1}\n{"a":2}\n');
    const records = await jsonlAdapter.read(file);
    expect(records).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('reads and concatenates records from every .jsonl file in a directory, in sorted order', async () => {
    writeFileSync(join(dir, 'b.jsonl'), '{"n":"b"}\n');
    writeFileSync(join(dir, 'a.jsonl'), '{"n":"a"}\n');
    writeFileSync(join(dir, 'ignore.txt'), '{"n":"ignored"}\n');
    const records = await jsonlAdapter.read(dir);
    expect(records).toEqual([{ n: 'a' }, { n: 'b' }]);
  });

  it('skips malformed JSON lines and warns on stderr instead of throwing', async () => {
    const file = join(dir, 'records.jsonl');
    writeFileSync(file, '{"a":1}\nnot json\n{"a":2}\n');
    const records = await jsonlAdapter.read(file);
    expect(records).toEqual([{ a: 1 }, { a: 2 }]);
    expect(stderrSpy).toHaveBeenCalled();
  });

  it('skips blank lines', async () => {
    const file = join(dir, 'records.jsonl');
    writeFileSync(file, '{"a":1}\n\n\n{"a":2}\n');
    const records = await jsonlAdapter.read(file);
    expect(records).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('skips non-object JSON lines (arrays, scalars)', async () => {
    const file = join(dir, 'records.jsonl');
    writeFileSync(file, '{"a":1}\n[1,2,3]\n"hello"\n{"a":2}\n');
    const records = await jsonlAdapter.read(file);
    expect(records).toEqual([{ a: 1 }, { a: 2 }]);
  });
});

describe('getAdapter', () => {
  it('returns the jsonl adapter by name', () => {
    expect(getAdapter('jsonl')).toBe(jsonlAdapter);
  });

  it('throws on an unknown adapter name', () => {
    expect(() => getAdapter('does-not-exist')).toThrow(/Unknown adapter/);
  });
});
