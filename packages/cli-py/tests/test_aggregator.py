from paceproof_cli.aggregator import summarize, verify_record, verify_records
from paceproof_cli.crypto import generate_keypair, sign_record_for_example


def _make_signed(private_key_b64: str, **overrides):
    unsigned = {
        "record_id": "rec-1",
        "issued_at": "2026-01-01T00:00:00.000Z",
        "provider": "acme-cloud",
        "hardware": "8xH100-SXM5",
        "workload_type": "training",
        "compute_amount": 10,
        "compute_unit": "gpu_hours",
        "issuer_public_key": "",
    }
    unsigned.update(overrides)
    signature = sign_record_for_example(unsigned, private_key_b64)
    return {**unsigned, "signature": signature}


def test_verify_record_marks_a_valid_record_as_verified() -> None:
    keypair = generate_keypair()
    raw = _make_signed(keypair.private_key_base64, issuer_public_key=keypair.public_key_base64)
    outcome = verify_record(raw)
    assert outcome["valid"] is True


def test_verify_record_marks_a_schema_invalid_record_as_unverified() -> None:
    outcome = verify_record({"record_id": "incomplete"})
    assert outcome["valid"] is False
    assert "schema validation failed" in outcome["reason"]


def test_verify_record_marks_a_tampered_record_as_unverified() -> None:
    keypair = generate_keypair()
    raw = _make_signed(
        keypair.private_key_base64,
        issuer_public_key=keypair.public_key_base64,
        compute_amount=10,
    )
    tampered = {**raw, "compute_amount": 5000}
    outcome = verify_record(tampered)
    assert outcome["valid"] is False


def test_summarize_keeps_verified_and_unverified_totals_separate() -> None:
    keypair = generate_keypair()
    good1 = _make_signed(
        keypair.private_key_base64,
        record_id="good-1",
        issuer_public_key=keypair.public_key_base64,
        compute_amount=10,
        provider="acme-cloud",
    )
    good2 = _make_signed(
        keypair.private_key_base64,
        record_id="good-2",
        issuer_public_key=keypair.public_key_base64,
        compute_amount=5,
        provider="acme-cloud",
    )
    bad = {
        "record_id": "bad-1",
        "provider": "acme-cloud",
        "compute_amount": 1000,
        "compute_unit": "gpu_hours",
    }

    outcomes = verify_records([good1, good2, bad])
    summary = summarize(outcomes)

    assert summary["verified_count"] == 2
    assert summary["unverified_count"] == 1
    assert summary["verified_compute_total_by_unit"]["gpu_hours"] == 15
    assert summary["verified_compute_total_by_unit"]["gpu_hours"] != 1015
    assert summary["unverified_compute_total_by_unit"]["gpu_hours"] == 1000
    assert summary["by_provider"]["acme-cloud"]["unverified_count"] == 1
    assert len(summary["unverified_reasons"]) == 1
    assert summary["unverified_reasons"][0]["record_id"] == "bad-1"


def test_summarize_handles_zero_records() -> None:
    summary = summarize([])
    assert summary["verified_count"] == 0
    assert summary["unverified_count"] == 0
    assert summary["verified_compute_total_by_unit"] == {}
    assert summary["by_provider"] == {}


def test_summarize_aggregates_by_workload_type_independently() -> None:
    keypair = generate_keypair()
    training = _make_signed(
        keypair.private_key_base64,
        record_id="r1",
        issuer_public_key=keypair.public_key_base64,
        workload_type="training",
        compute_amount=8,
    )
    inference = _make_signed(
        keypair.private_key_base64,
        record_id="r2",
        issuer_public_key=keypair.public_key_base64,
        workload_type="inference",
        compute_amount=3,
    )
    summary = summarize(verify_records([training, inference]))
    assert summary["by_workload_type"]["training"]["verified"][0]["compute_amount_total"] == 8
    assert summary["by_workload_type"]["inference"]["verified"][0]["compute_amount_total"] == 3
