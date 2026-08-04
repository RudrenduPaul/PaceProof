import json

import pytest

from paceproof_cli.aggregator import summarize, verify_records
from paceproof_cli.init import scaffold_example


def test_creates_a_keypair_a_records_file_and_a_readme(tmp_path) -> None:
    target = tmp_path / "example"
    result = scaffold_example(str(target))
    assert (target / "keypair.json").exists()
    assert (target / "records.jsonl").exists()
    assert (target / "README.md").exists()
    assert result.records_file == str(target / "records.jsonl")


def test_produces_exactly_3_valid_and_4_intentionally_invalid_records(tmp_path) -> None:
    target = tmp_path / "example"
    result = scaffold_example(str(target))
    lines = open(result.records_file, encoding="utf-8").read().strip().split("\n")
    records = [json.loads(line) for line in lines]
    assert len(records) == 7

    summary = summarize(verify_records(records))
    assert summary["verified_count"] == 3
    assert summary["unverified_count"] == 4


def test_refuses_to_overwrite_an_existing_directory(tmp_path) -> None:
    target = tmp_path / "example"
    scaffold_example(str(target))
    with pytest.raises(FileExistsError, match="already exists"):
        scaffold_example(str(target))
