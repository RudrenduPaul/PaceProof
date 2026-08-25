import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Single source of truth for the package version: read it straight out of
 * package.json at runtime instead of duplicating it as a hardcoded string
 * constant (which previously drifted out of sync -- `--version` and the MCP
 * server both reported "0.1.0" long after package.json moved to "0.1.1").
 *
 * This module lives at src/version.ts and compiles to dist/version.js, both
 * exactly one directory below the package root, so `../package.json`
 * resolves correctly whether it's imported from the built dist/ output or
 * (as in the test suite) directly from src/ via a TS-aware loader.
 */
const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf-8')) as {
  version: string;
};

export const VERSION: string = pkg.version;
