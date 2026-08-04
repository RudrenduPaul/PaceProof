import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Adapter } from './types.js';
import type { RawRecord } from '../types.js';

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
      // invocation the user typed themselves.
      const res = await fetch(input);
      if (!res.ok) {
        throw new Error(`Failed to fetch ${input}: HTTP ${res.status} ${res.statusText}`);
      }
      const text = await res.text();
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
