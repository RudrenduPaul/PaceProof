from paceproof_cli.crypto import (
    canonicalize_record,
    generate_keypair,
    sign_record_for_example,
    verify_record_signature,
)


def _base_unsigned(**overrides):
    record = {
        "record_id": "rec-001",
        "issued_at": "2026-01-01T00:00:00.000Z",
        "provider": "acme-cloud",
        "hardware": "8xH100-SXM5",
        "workload_type": "training",
        "compute_amount": 12.5,
        "compute_unit": "gpu_hours",
        "issuer_public_key": "",
    }
    record.update(overrides)
    return record


def test_canonicalize_record_is_stable_regardless_of_key_order() -> None:
    a = {**_base_unsigned(), "record_id": "x"}
    b = {"issuer_public_key": "", "workload_type": "training", **_base_unsigned(), "record_id": "x"}
    assert canonicalize_record(a) == canonicalize_record(b)


def test_canonicalize_record_renders_integral_float_with_no_decimal_point() -> None:
    payload = canonicalize_record(_base_unsigned(compute_amount=42))
    assert b'"compute_amount":42' in payload


def test_canonicalize_record_renders_non_integral_number_without_padding() -> None:
    payload = canonicalize_record(_base_unsigned(compute_amount=12.5))
    assert b'"compute_amount":12.5' in payload


def test_verify_accepts_a_validly_signed_record() -> None:
    keypair = generate_keypair()
    unsigned = _base_unsigned(issuer_public_key=keypair.public_key_base64)
    signature = sign_record_for_example(unsigned, keypair.private_key_base64)
    record = {**unsigned, "signature": signature}
    result = verify_record_signature(record)
    assert result.valid is True


def test_verify_rejects_a_tampered_payload() -> None:
    keypair = generate_keypair()
    unsigned = _base_unsigned(issuer_public_key=keypair.public_key_base64, compute_amount=10)
    signature = sign_record_for_example(unsigned, keypair.private_key_base64)
    tampered = {**unsigned, "compute_amount": 999, "signature": signature}
    result = verify_record_signature(tampered)
    assert result.valid is False
    assert "does not match" in (result.reason or "")


def test_verify_rejects_a_record_signed_by_the_wrong_key() -> None:
    keypair = generate_keypair()
    wrong_keypair = generate_keypair()
    unsigned = _base_unsigned(issuer_public_key=keypair.public_key_base64)
    signature = sign_record_for_example(unsigned, wrong_keypair.private_key_base64)
    record = {**unsigned, "signature": signature}
    result = verify_record_signature(record)
    assert result.valid is False


def test_verify_rejects_a_malformed_non_base64_signature() -> None:
    keypair = generate_keypair()
    unsigned = _base_unsigned(issuer_public_key=keypair.public_key_base64)
    record = {**unsigned, "signature": "not-valid-base64!!"}
    result = verify_record_signature(record)
    assert result.valid is False
    assert "base64" in (result.reason or "")


def test_verify_rejects_a_signature_of_the_wrong_byte_length() -> None:
    keypair = generate_keypair()
    unsigned = _base_unsigned(issuer_public_key=keypair.public_key_base64)
    record = {**unsigned, "signature": "QUJDRA=="}
    result = verify_record_signature(record)
    assert result.valid is False
    assert "64 bytes" in (result.reason or "")


def test_verify_rejects_a_malformed_non_base64_public_key() -> None:
    keypair = generate_keypair()
    unsigned = _base_unsigned(issuer_public_key="***not-base64***")
    signature = sign_record_for_example(unsigned, keypair.private_key_base64)
    record = {**unsigned, "signature": signature}
    result = verify_record_signature(record)
    assert result.valid is False
    assert "base64" in (result.reason or "")
