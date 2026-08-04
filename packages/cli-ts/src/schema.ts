import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as Ajv2020Module from 'ajv/dist/2020.js';
import * as AjvFormatsModule from 'ajv-formats';
import type { RawRecord } from './types.js';

// schema/attestation-record.schema.json ships alongside dist/ (see package.json
// "files") -- both live one level below the package root, so this resolves the
// same way whether it's run from src/ (vitest) or dist/ (the built CLI).
const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, '..', 'schema', 'attestation-record.schema.json');

export const attestationRecordSchema: object = JSON.parse(readFileSync(schemaPath, 'utf-8')) as object;

// ajv's CJS type declarations don't fully play along with NodeNext module
// resolution's default-import inference, so these are pulled off the
// namespace import explicitly rather than via a default import.
const Ajv2020 = (Ajv2020Module as unknown as { default: typeof Ajv2020Module.Ajv2020 }).default;
const addFormats = (AjvFormatsModule as unknown as { default: (ajv: InstanceType<typeof Ajv2020>) => void }).default;

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateFn = ajv.compile(attestationRecordSchema);

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validate a raw record against the canonical attestation-record schema. */
export function validateAttestationRecord(record: RawRecord): SchemaValidationResult {
  const valid = validateFn(record);
  if (valid) {
    return { valid: true, errors: [] };
  }
  const errors = (validateFn.errors ?? []).map((err) => {
    const path = err.instancePath || '(root)';
    return `${path} ${err.message ?? 'is invalid'}`;
  });
  return { valid: false, errors };
}
