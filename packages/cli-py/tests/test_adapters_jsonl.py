import pytest

from paceproof_cli.adapters import get_adapter, jsonl_adapter


@pytest.fixture()
def tmp_dir(tmp_path):
    return tmp_path


def test_reads_records_from_a_single_file(tmp_dir) -> None:
    file = tmp_dir / "records.jsonl"
    file.write_text('{"a":1}\n{"a":2}\n', encoding="utf-8")
    records = jsonl_adapter.read(str(file))
    assert records == [{"a": 1}, {"a": 2}]


def test_reads_and_concatenates_records_from_every_jsonl_file_in_a_directory_sorted(tmp_dir) -> None:
    (tmp_dir / "b.jsonl").write_text('{"n":"b"}\n', encoding="utf-8")
    (tmp_dir / "a.jsonl").write_text('{"n":"a"}\n', encoding="utf-8")
    (tmp_dir / "ignore.txt").write_text('{"n":"ignored"}\n', encoding="utf-8")
    records = jsonl_adapter.read(str(tmp_dir))
    assert records == [{"n": "a"}, {"n": "b"}]


def test_skips_malformed_json_lines_and_warns_on_stderr_instead_of_raising(tmp_dir, capsys) -> None:
    file = tmp_dir / "records.jsonl"
    file.write_text('{"a":1}\nnot json\n{"a":2}\n', encoding="utf-8")
    records = jsonl_adapter.read(str(file))
    assert records == [{"a": 1}, {"a": 2}]
    captured = capsys.readouterr()
    assert "skipping malformed JSON" in captured.err


def test_skips_blank_lines(tmp_dir) -> None:
    file = tmp_dir / "records.jsonl"
    file.write_text('{"a":1}\n\n\n{"a":2}\n', encoding="utf-8")
    records = jsonl_adapter.read(str(file))
    assert records == [{"a": 1}, {"a": 2}]


def test_skips_non_object_json_lines(tmp_dir) -> None:
    file = tmp_dir / "records.jsonl"
    file.write_text('{"a":1}\n[1,2,3]\n"hello"\n{"a":2}\n', encoding="utf-8")
    records = jsonl_adapter.read(str(file))
    assert records == [{"a": 1}, {"a": 2}]


def test_get_adapter_returns_the_jsonl_adapter_by_name() -> None:
    assert get_adapter("jsonl") is jsonl_adapter


def test_get_adapter_raises_on_unknown_adapter_name() -> None:
    with pytest.raises(ValueError, match="Unknown adapter"):
        get_adapter("does-not-exist")
