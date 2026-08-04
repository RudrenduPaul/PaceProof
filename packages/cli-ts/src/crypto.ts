import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import type { AttestationRecord } from './types.js';

/**
 * @noble/ed25519 is an audited, TypeScript-first Ed25519 implementation with
 * a synchronous verify() -- suitable for CLI use where async/await ceremony
 * would only add noise. tweetnacl was the other option considered; @noble was
 * chosen for its API and smaller footprint. Since v2 it ships without a
 * bundled hash function, so its sha512 hook has to be wired to
 * @noble/hashes explicitly before the sync sign()/verify() calls can run.
 */
ed.etc.sha512Sync = (...messages: Uint8Array[]): Uint8Array =>
  sha512(ed.etc.concatBytes(...messages));

const SIGNED_FIELDS = [
  'record_id',
  'issued_at',
  'provider',
  'hardware',
  'workload_type',
  'compute_amount',
  'compute_unit',
  'issuer_public_key',
] as const;

/** Escape a string the same way both the TS and Python canonicalizers do. */
function encodeString(value: string): string {
  let out = '"';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    switch (ch) {
      case '"':
        out += '\\"';
        break;
      case '\\':
        out += '\\\\';
        break;
      case '\n':
        out += '\\n';
        break;
      case '\r':
        out += '\\r';
        break;
      case '\t':
        out += '\\t';
        break;
      default:
        if (code < 0x20) {
          out += '\\u' + code.toString(16).padStart(4, '0');
        } else {
          out += ch;
        }
    }
  }
  return out + '"';
}

/**
 * Formats a number identically to the Python implementation's
 * format_number(): integers (including integral floats like 42.0) render
 * with no decimal point, non-integral numbers render via the shortest
 * round-trip decimal representation. This is what makes a signature
 * generated against one implementation's canonical JSON verify under the
 * other.
 */
function encodeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error('Cannot canonicalize a non-finite number');
  }
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toString();
}

function encodeValue(value: unknown): string {
  if (typeof value === 'string') return encodeString(value);
  if (typeof value === 'number') return encodeNumber(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value === null) return 'null';
  throw new Error(`Cannot canonicalize value of type ${typeof value}`);
}

/**
 * Builds the canonical JSON byte payload a record's signature is computed
 * over: every field except `signature`, keys in a fixed, documented order,
 * no insignificant whitespace. See ARCHITECTURE.md for the full spec.
 */
export function canonicalizeRecord(record: Record<string, unknown>): Uint8Array {
  const parts: string[] = [];
  for (const key of SIGNED_FIELDS) {
    if (!(key in record)) {
      throw new Error(`Cannot canonicalize record: missing field "${key}"`);
    }
    parts.push(`${encodeString(key)}:${encodeValue(record[key])}`);
  }
  const json = `{${parts.join(',')}}`;
  return new TextEncoder().encode(json);
}

export interface SignatureCheckResult {
  valid: boolean;
  reason?: string;
}

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$/;

/**
 * Buffer.from(str, 'base64') silently ignores invalid characters instead of
 * throwing, so malformed base64 has to be rejected explicitly before
 * decoding -- otherwise a tampered/garbage signature could decode to some
 * unintended byte string instead of failing verification loudly.
 */
function base64ToBytes(value: string): Uint8Array {
  if (value.length === 0 || !BASE64_PATTERN.test(value)) {
    throw new Error('invalid base64 string');
  }
  return new Uint8Array(Buffer.from(value, 'base64'));
}

/**
 * Verifies a record's Ed25519 signature against its own embedded
 * issuer_public_key. Never throws on malformed input -- any failure mode
 * (bad base64, wrong-length key, wrong-length signature, tampered payload,
 * wrong key) comes back as { valid: false, reason }.
 */
export function verifyRecordSignature(record: AttestationRecord): SignatureCheckResult {
  let publicKey: Uint8Array;
  let signature: Uint8Array;
  try {
    publicKey = base64ToBytes(record.issuer_public_key);
  } catch {
    return { valid: false, reason: 'issuer_public_key is not valid base64' };
  }
  try {
    signature = base64ToBytes(record.signature);
  } catch {
    return { valid: false, reason: 'signature is not valid base64' };
  }
  if (publicKey.length !== 32) {
    return { valid: false, reason: `issuer_public_key must decode to 32 bytes, got ${publicKey.length}` };
  }
  if (signature.length !== 64) {
    return { valid: false, reason: `signature must decode to 64 bytes, got ${signature.length}` };
  }

  let message: Uint8Array;
  try {
    message = canonicalizeRecord(record as unknown as Record<string, unknown>);
  } catch (err) {
    return { valid: false, reason: `failed to build canonical payload: ${(err as Error).message}` };
  }

  try {
    const ok = ed.verify(signature, message, publicKey);
    return ok ? { valid: true } : { valid: false, reason: 'signature does not match record contents' };
  } catch (err) {
    return { valid: false, reason: `signature verification error: ${(err as Error).message}` };
  }
}

export interface GeneratedKeypair {
  publicKeyBase64: string;
  privateKeyBase64: string;
}

/** Generates a fresh Ed25519 keypair, used by `paceproof init`. */
export function generateKeypair(): GeneratedKeypair {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = ed.getPublicKey(privateKey);
  return {
    publicKeyBase64: Buffer.from(publicKey).toString('base64'),
    privateKeyBase64: Buffer.from(privateKey).toString('base64'),
  };
}

/** Signs the canonical payload of a record with the given base64 private key. Used only by `paceproof init` to build its example fixtures -- PaceProof itself never signs real attestation records. */
export function signRecordForExample(
  record: Omit<AttestationRecord, 'signature'>,
  privateKeyBase64: string,
): string {
  const message = canonicalizeRecord(record);
  const privateKey = base64ToBytes(privateKeyBase64);
  const signature = ed.sign(message, privateKey);
  return Buffer.from(signature).toString('base64');
}
