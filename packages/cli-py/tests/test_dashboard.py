import re

from paceproof_cli.dashboard import render_dashboard_html
from paceproof_cli.report import build_report


def test_produces_self_contained_html_with_no_external_requests() -> None:
    report = build_report("test", [{"record_id": "r1"}])
    html = render_dashboard_html(report)
    assert "<!doctype html>" in html
    assert "<style>" in html
    assert not re.search(r"https?://", html)
    assert "<script src=" not in html
    assert "<link " not in html


def test_escapes_untrusted_record_content_to_prevent_html_injection() -> None:
    report = build_report("test", [{"record_id": "<script>alert(1)</script>"}])
    html = render_dashboard_html(report)
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;" in html
