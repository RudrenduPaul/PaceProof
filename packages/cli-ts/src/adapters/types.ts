import type { RawRecord } from '../types.js';

/**
 * An Adapter turns some raw input (a file path, a directory, a URL) into a
 * stream of records already normalized to the canonical attestation-record
 * shape (schema validation still runs downstream in the aggregator -- an
 * adapter's job is only field-mapping/format-parsing, not verification).
 *
 * This is the extensibility point PaceProof is built around: a
 * ComputeLedger-format adapter, or any other provider's native export
 * format, implements this interface without touching aggregator.ts,
 * report.ts, or the CLI wiring beyond registering the adapter's name.
 */
export interface Adapter {
  readonly name: string;
  /** Reads and normalizes records from `input`. Never fetches network data unless `input` is itself a URL and the caller opted in. */
  read(input: string): Promise<RawRecord[]>;
}
