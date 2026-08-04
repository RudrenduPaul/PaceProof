#!/usr/bin/env node
import { run } from './cli.js';

run(process.argv).catch((err: unknown) => {
  process.stderr.write(`paceproof: unexpected error: ${(err as Error).message}\n`);
  process.exitCode = 2;
});
