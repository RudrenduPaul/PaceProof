from paceproof_cli.crypto import generate_keypair, sign_record_for_example
from paceproof_cli.report import build_report, render_human_readable


def test_render_shows_verified_and_unverified_as_separate_sections() -> None:
    keypair = generate_keypair()
    unsigned = {
        "record_id": "r1",
        "issued_at": "2026-01-01T00:00:00.000Z",
        "provider": "acme-cloud",
        "hardware": "8xH100-SXM5",
        "workload_type": "training",
        "compute_amount": 10,
        "compute_unit": "gpu_hours",
        "issuer_public_key": keypair.public_key_base64,
    }
    signature = sign_record_for_example(unsigned, keypair.private_key_base64)
    good = {**unsigned, "signature": signature}
    bad = {"record_id": "r2"}

    report = build_report("test-source", [good, bad])
    assert report["summary"]["verified_count"] == 1
    assert report["summary"]["unverified_count"] == 1

    text = render_human_readable(report)
    assert "== VERIFIED ==" in text
    assert "== UNVERIFIED" in text
    assert text.index("== VERIFIED ==") < text.index("== UNVERIFIED")


def test_build_report_handles_an_empty_input_set() -> None:
    report = build_report("empty-source", [])
    assert report["summary"]["verified_count"] == 0
    assert report["summary"]["unverified_count"] == 0
    text = render_human_readable(report)
    assert "(none)" in text
