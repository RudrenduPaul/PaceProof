from paceproof_cli.schema import validate_attestation_record

VALID_RECORD = {
    "record_id": "rec-001",
    "issued_at": "2026-01-01T00:00:00.000Z",
    "provider": "acme-cloud",
    "hardware": "8xH100-SXM5",
    "workload_type": "training",
    "compute_amount": 12.5,
    "compute_unit": "gpu_hours",
    "issuer_public_key": "QUJDRA==",
    "signature": "QUJDRA==",
}


def test_accepts_a_well_formed_record() -> None:
    result = validate_attestation_record(VALID_RECORD)
    assert result.valid is True
    assert result.errors == []


def test_rejects_a_record_missing_a_required_field() -> None:
    record = dict(VALID_RECORD)
    del record["signature"]
    result = validate_attestation_record(record)
    assert result.valid is False
    assert any("signature" in e for e in result.errors)


def test_rejects_an_invalid_workload_type_enum_value() -> None:
    record = {**VALID_RECORD, "workload_type": "mining"}
    result = validate_attestation_record(record)
    assert result.valid is False


def test_rejects_a_negative_compute_amount() -> None:
    record = {**VALID_RECORD, "compute_amount": -1}
    result = validate_attestation_record(record)
    assert result.valid is False


def test_rejects_a_non_string_hardware_field() -> None:
    record = {**VALID_RECORD, "hardware": 123}
    result = validate_attestation_record(record)
    assert result.valid is False


def test_rejects_an_unrecognized_additional_property() -> None:
    record = {**VALID_RECORD, "unexpected_field": "nope"}
    result = validate_attestation_record(record)
    assert result.valid is False


def test_rejects_a_malformed_issued_at() -> None:
    record = {**VALID_RECORD, "issued_at": "not-a-date"}
    result = validate_attestation_record(record)
    assert result.valid is False


def test_rejects_absurdly_long_free_text_fields() -> None:
    # A malicious or compromised record source (a third-party provider's
    # export, or the response to `ingest <url>`) could otherwise embed a
    # multi-megabyte string in any of these fields.
    huge_string = "a" * 10_000_000  # 10 MB in a single field
    record = {**VALID_RECORD, "provider": huge_string}
    result = validate_attestation_record(record)
    assert result.valid is False


def test_rejects_issuer_public_key_far_longer_than_any_real_ed25519_value() -> None:
    huge_base64 = "QQ==" * 100  # way past the 44-char real length, still valid base64 shape
    record = {**VALID_RECORD, "issuer_public_key": huge_base64}
    result = validate_attestation_record(record)
    assert result.valid is False
