"""Ed25519 signature verification and canonical JSON encoding.

PyNaCl (libsodium bindings) was chosen over a pure-Python Ed25519
implementation for the same reason @noble/ed25519 was chosen on the
TypeScript side: it's a well-audited, widely used library rather than a
hand-rolled crypto primitive.

canonicalize_record() here must produce byte-identical output to
canonicalizeRecord() in packages/cli-ts/src/crypto.ts for the same record --
see ARCHITECTURE.md's "Canonical JSON and the signature" section. A
cross-implementation parity test (tests/test_cross_language_parity.py)
verifies a shared fixture round-trips identically through both.
"""

from __future__ import annotations

import base64
import binascii
import math
import re
from dataclasses import dataclass
from typing import Any

import nacl.exceptions
import nacl.signing

from .types import AttestationRecord

SIGNED_FIELDS: tuple[str, ...] = (
    "record_id",
    "issued_at",
    "provider",
    "hardware",
    "workload_type",
    "compute_amount",
    "compute_unit",
    "issuer_public_key",
)

_BASE64_PATTERN = re.compile(r"^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$")

_ESCAPES = {
    '"': '\\"',
    "\\": "\\\\",
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t",
}


def _encode_string(value: str) -> str:
    out = ['"']
    for ch in value:
        if ch in _ESCAPES:
            out.append(_ESCAPES[ch])
        elif ord(ch) < 0x20:
            out.append(f"\\u{ord(ch):04x}")
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def _encode_number(value: Any) -> str:
    if isinstance(value, bool):
        raise TypeError("Cannot canonicalize a boolean as a number")
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("Cannot canonicalize a non-finite number")
        if value.is_integer():
            return str(int(value))
        # repr() gives the shortest decimal string that round-trips back to
        # the same float -- the same rule JS's Number.prototype.toString()
        # follows for the same value.
        return repr(value)
    raise TypeError(f"Cannot canonicalize value of type {type(value).__name__}")


def _encode_value(value: Any) -> str:
    if isinstance(value, str):
        return _encode_string(value)
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return _encode_number(value)
    if value is None:
        return "null"
    raise TypeError(f"Cannot canonicalize value of type {type(value).__name__}")


def canonicalize_record(record: dict[str, Any]) -> bytes:
    """Build the canonical JSON byte payload a record's signature is computed over."""
    parts = []
    for key in SIGNED_FIELDS:
        if key not in record:
            raise ValueError(f'Cannot canonicalize record: missing field "{key}"')
        parts.append(f"{_encode_string(key)}:{_encode_value(record[key])}")
    json_text = "{" + ",".join(parts) + "}"
    return json_text.encode("utf-8")


def _base64_to_bytes(value: str) -> bytes:
    if not value or not _BASE64_PATTERN.match(value):
        raise ValueError("invalid base64 string")
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("invalid base64 string") from exc


@dataclass
class SignatureCheckResult:
    valid: bool
    reason: str | None = None


def verify_record_signature(record: AttestationRecord) -> SignatureCheckResult:
    """Verify a record's Ed25519 signature against its own embedded issuer_public_key.

    Never raises -- every failure mode (bad base64, wrong-length key, wrong-length
    signature, tampered payload, wrong key) comes back as a SignatureCheckResult.
    """
    try:
        public_key_bytes = _base64_to_bytes(record["issuer_public_key"])
    except ValueError:
        return SignatureCheckResult(valid=False, reason="issuer_public_key is not valid base64")

    try:
        signature_bytes = _base64_to_bytes(record["signature"])
    except ValueError:
        return SignatureCheckResult(valid=False, reason="signature is not valid base64")

    if len(public_key_bytes) != 32:
        return SignatureCheckResult(
            valid=False,
            reason=f"issuer_public_key must decode to 32 bytes, got {len(public_key_bytes)}",
        )
    if len(signature_bytes) != 64:
        return SignatureCheckResult(
            valid=False,
            reason=f"signature must decode to 64 bytes, got {len(signature_bytes)}",
        )

    try:
        message = canonicalize_record(dict(record))
    except (ValueError, TypeError) as exc:
        return SignatureCheckResult(valid=False, reason=f"failed to build canonical payload: {exc}")

    try:
        verify_key = nacl.signing.VerifyKey(public_key_bytes)
        verify_key.verify(message, signature_bytes)
        return SignatureCheckResult(valid=True)
    except nacl.exceptions.BadSignatureError:
        return SignatureCheckResult(valid=False, reason="signature does not match record contents")
    except Exception as exc:  # noqa: BLE001 -- any other crypto-library failure is a verification failure, not a crash
        return SignatureCheckResult(valid=False, reason=f"signature verification error: {exc}")


@dataclass
class GeneratedKeypair:
    public_key_base64: str
    private_key_base64: str


def generate_keypair() -> GeneratedKeypair:
    """Generates a fresh Ed25519 keypair, used by `paceproof init`."""
    signing_key = nacl.signing.SigningKey.generate()
    public_key = signing_key.verify_key.encode()
    private_key = signing_key.encode()
    return GeneratedKeypair(
        public_key_base64=base64.b64encode(public_key).decode("ascii"),
        private_key_base64=base64.b64encode(private_key).decode("ascii"),
    )


def sign_record_for_example(record: dict[str, Any], private_key_base64: str) -> str:
    """Signs the canonical payload of a record with the given base64 private key.

    Used only by `paceproof init` to build its example fixtures -- PaceProof
    itself never signs real attestation records.
    """
    message = canonicalize_record(record)
    private_key_bytes = base64.b64decode(private_key_base64)
    signing_key = nacl.signing.SigningKey(private_key_bytes)
    signed = signing_key.sign(message)
    return base64.b64encode(signed.signature).decode("ascii")
