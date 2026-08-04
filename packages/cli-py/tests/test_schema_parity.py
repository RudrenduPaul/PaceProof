from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


def test_package_schema_copy_matches_repo_root_source_of_truth() -> None:
    schema_name = "attestation-record.schema.json"
    root_schema = (REPO_ROOT / "schema" / schema_name).read_text(encoding="utf-8")
    package_schema_path = REPO_ROOT / "packages" / "cli-py" / "src" / "paceproof_cli" / "schema" / schema_name
    package_schema = package_schema_path.read_text(encoding="utf-8")
    assert package_schema == root_schema
