import json

from click.testing import CliRunner

from paceproof_cli.cli import main


def _run(args):
    runner = CliRunner()
    return runner.invoke(main, args)


def test_help_lists_every_command() -> None:
    result = _run(["--help"])
    assert result.exit_code == 0
    for cmd in ["init", "verify", "ingest", "report", "dashboard", "mcp"]:
        assert cmd in result.output


def test_init_scaffolds_a_working_example_directory(tmp_path) -> None:
    example_dir = tmp_path / "paceproof-example"
    result = _run(["init", str(example_dir)])
    assert result.exit_code == 0
    assert "Created example data" in result.output
    assert (example_dir / "records.jsonl").exists()
    assert (example_dir / "keypair.json").exists()


def test_init_refuses_to_overwrite_and_exits_non_zero(tmp_path) -> None:
    example_dir = tmp_path / "paceproof-example"
    _run(["init", str(example_dir)])
    result = _run(["init", str(example_dir)])
    assert result.exit_code != 0
    assert "already exists" in result.output


def test_verify_reports_3_verified_4_unverified_and_exits_non_zero(tmp_path) -> None:
    example_dir = tmp_path / "paceproof-example"
    _run(["init", str(example_dir)])
    result = _run(["verify", str(example_dir), "--json"])
    assert result.exit_code == 1
    parsed = json.loads(result.output)
    assert parsed["verified_count"] == 3
    assert parsed["unverified_count"] == 4


def test_ingest_emits_normalized_jsonl_records_to_stdout(tmp_path) -> None:
    example_dir = tmp_path / "paceproof-example"
    _run(["init", str(example_dir)])
    result = _run(["ingest", str(example_dir / "records.jsonl")])
    assert result.exit_code == 0
    lines = result.output.strip().split("\n")
    assert len(lines) == 7
    json.loads(lines[0])


def test_report_json_produces_full_report_with_separated_totals(tmp_path) -> None:
    example_dir = tmp_path / "paceproof-example"
    _run(["init", str(example_dir)])
    result = _run(["report", str(example_dir), "--json"])
    assert result.exit_code == 0
    report = json.loads(result.output)
    assert report["summary"]["verified_count"] == 3
    assert report["summary"]["unverified_count"] == 4
    assert report["summary"]["verified_compute_total_by_unit"]["gpu_hours"] == 144.5
    assert report["summary"]["unverified_compute_total_by_unit"]["gpu_hours"] == 1009


def test_report_without_json_renders_human_readable_table(tmp_path) -> None:
    example_dir = tmp_path / "paceproof-example"
    _run(["init", str(example_dir)])
    result = _run(["report", str(example_dir)])
    assert result.exit_code == 0
    assert "== VERIFIED ==" in result.output
    assert "== UNVERIFIED" in result.output


def test_dashboard_writes_a_self_contained_html_file(tmp_path) -> None:
    example_dir = tmp_path / "paceproof-example"
    _run(["init", str(example_dir)])
    out_file = tmp_path / "dashboard.html"
    result = _run(["dashboard", str(example_dir), "--out", str(out_file)])
    assert result.exit_code == 0
    assert "Wrote dashboard" in result.output
    assert out_file.exists()
    assert "<!doctype html>" in out_file.read_text(encoding="utf-8")


def test_mcp_reports_not_implemented_and_exits_non_zero() -> None:
    result = _run(["mcp"])
    assert result.exit_code != 0
    assert "not implemented" in result.output
