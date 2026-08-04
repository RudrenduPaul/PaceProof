import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { Adapter } from './types.js';
import type { RawRecord } from '../types.js';

// Bounds for the one network call PaceProof ever makes (`ingest <url>`),
// which fetches whatever the operator points it at -- possibly a
// third-party or compromised endpoint. Without a timeout a hung connection
// blocks the CLI/MCP call forever; without a body-size cap an
// attacker-controlled or misbehaving server can exhaust memory by streaming
// an unbounded response.
const INGEST_URL_TIMEOUT_MS = 30_000;
const INGEST_URL_MAX_BYTES = 50 * 1024 * 1024; // 50 MiB

async function fetchUrlWithBounds(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INGEST_URL_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: HTTP ${res.status} ${res.statusText}`);
    }
    const contentLength = res.headers.get('content-length');
    if (contentLength && Number(contentLength) > INGEST_URL_MAX_BYTES) {
      throw new Error(
        `Refusing to fetch ${url}: response is ${contentLength} bytes, exceeds the ${INGEST_URL_MAX_BYTES}-byte limit`,
      );
    }
    if (!res.body) {
      return await res.text();
    }
    // Stream via Node's Readable rather than the raw WHATWG reader so the
    // running byte count can abort the download before it's fully buffered
    // -- protects against a response with no (or a lying) Content-Length
    // header, not just an honestly-declared oversized one.
    const nodeStream = Readable.fromWeb(res.body);
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of nodeStream as AsyncIterable<Buffer>) {
      total += chunk.length;
      if (total > INGEST_URL_MAX_BYTES) {
        nodeStream.destroy();
        throw new Error(`Refusing to fetch ${url}: response exceeded the ${INGEST_URL_MAX_BYTES}-byte limit`);
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf-8');
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Failed to fetch ${url}: request timed out after ${INGEST_URL_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonlText(text: string, sourceLabel: string): RawRecord[] {
  const records: RawRecord[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] ?? '').trim();
    if (line.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      // A malformed line is a data-quality problem in the input, not a
      // signature/schema problem -- it never becomes a silently-dropped
      // record and never crashes the whole ingest run. It's surfaced on
      // stderr so the operator can go fix the source file.
      process.stderr.write(
        `paceproof: skipping malformed JSON on ${sourceLabel}:${i + 1}: ${(err as Error).message}\n`,
      );
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      process.stderr.write(`paceproof: skipping non-object JSON line on ${sourceLabel}:${i + 1}\n`);
      continue;
    }
    records.push(parsed as RawRecord);
  }
  return records;
}

/**
 * Reference adapter: reads newline-delimited JSON records already in
 * canonical attestation-record shape. Intentionally the simplest possible
 * adapter -- it exists to demonstrate the Adapter interface, not to do any
 * real format translation. A provider-specific adapter (e.g. for
 * ComputeLedger's native export) implements the same Adapter interface
 * without touching this file.
 */
export const jsonlAdapter: Adapter = {
  name: 'jsonl',
  async read(input: string): Promise<RawRecord[]> {
    if (input.startsWith('http://') || input.startsWith('https://')) {
      // The only network call in PaceProof: an explicit `ingest <url>`
      // invocation the user typed themselves. Bounded by timeout and
      // response size (see fetchUrlWithBounds) so a slow or malicious
      // endpoint can't hang the process or exhaust memory.
      const text = await fetchUrlWithBounds(input);
      return parseJsonlText(text, input);
    }

    const stat = statSync(input);
    if (stat.isDirectory()) {
      const files = readdirSync(input)
        .filter((f) => f.endsWith('.jsonl'))
        .sort();
      const records: RawRecord[] = [];
      for (const file of files) {
        const filePath = join(input, file);
        const text = readFileSync(filePath, 'utf-8');
        records.push(...parseJsonlText(text, filePath));
      }
      return records;
    }

    const text = readFileSync(input, 'utf-8');
    return parseJsonlText(text, input);
  },
};

export const adapters: Record<string, Adapter> = {
  jsonl: jsonlAdapter,
};

export function getAdapter(name: string): Adapter {
  const adapter = adapters[name];
  if (!adapter) {
    const known = Object.keys(adapters).join(', ');
    throw new Error(`Unknown adapter "${name}". Known adapters: ${known}`);
  }
  return adapter;
}
