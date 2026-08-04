import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
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

describe('jsonlAdapter over http(s)', () => {
  let server: Server;
  let baseUrl: string;

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('reads records from a URL', async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/jsonl' });
      res.end('{"a":1}\n{"a":2}\n');
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/records.jsonl`;

    const records = await jsonlAdapter.read(baseUrl);
    expect(records).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('refuses a response whose declared Content-Length exceeds the size cap instead of buffering it', async () => {
    const hugeSize = 200 * 1024 * 1024; // 200 MiB, well over the 50 MiB cap
    server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/jsonl', 'content-length': String(hugeSize) });
      // Deliberately never writes hugeSize bytes -- the adapter must reject
      // based on the declared Content-Length before it starts buffering, so
      // ending the response short (instead of hanging the connection open)
      // still proves the check runs before any body is consumed.
      res.end('{"a":1}\n');
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/huge.jsonl`;

    await expect(jsonlAdapter.read(baseUrl)).rejects.toThrow(/exceeds the .* limit/);
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
