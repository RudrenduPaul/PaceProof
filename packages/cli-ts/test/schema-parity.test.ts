import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');

describe('schema parity', () => {
  it("this package's copy of the schema matches the repo root's single source of truth", () => {
    const rootSchema = readFileSync(join(repoRoot, 'schema', 'attestation-record.schema.json'), 'utf-8');
    const packageSchema = readFileSync(join(here, '..', 'schema', 'attestation-record.schema.json'), 'utf-8');
    expect(packageSchema).toBe(rootSchema);
  });
});
