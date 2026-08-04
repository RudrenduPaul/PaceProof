import http.server
import threading

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


class _JsonlHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args: object) -> None:  # silence test output
        pass

    def do_GET(self) -> None:  # noqa: N802 -- required override name
        body = b'{"a":1}\n{"a":2}\n'
        self.send_response(200)
        self.send_header("Content-Type", "application/jsonl")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class _HugeContentLengthHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args: object) -> None:  # silence test output
        pass

    def do_GET(self) -> None:  # noqa: N802 -- required override name
        # Declares a 200 MiB body (well over the 50 MiB cap) but only ever
        # sends a few bytes -- the adapter must reject based on the declared
        # Content-Length before it starts buffering the response.
        huge_size = 200 * 1024 * 1024
        self.send_response(200)
        self.send_header("Content-Type", "application/jsonl")
        self.send_header("Content-Length", str(huge_size))
        self.end_headers()
        self.wfile.write(b'{"a":1}\n')


def _serve(handler_cls: type[http.server.BaseHTTPRequestHandler]) -> http.server.HTTPServer:
    server = http.server.HTTPServer(("127.0.0.1", 0), handler_cls)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def test_reads_records_from_a_url() -> None:
    server = _serve(_JsonlHandler)
    try:
        url = f"http://127.0.0.1:{server.server_port}/records.jsonl"
        records = jsonl_adapter.read(url)
        assert records == [{"a": 1}, {"a": 2}]
    finally:
        server.shutdown()


def test_refuses_a_response_whose_declared_content_length_exceeds_the_size_cap() -> None:
    server = _serve(_HugeContentLengthHandler)
    try:
        url = f"http://127.0.0.1:{server.server_port}/huge.jsonl"
        with pytest.raises(RuntimeError, match="exceeds the .* limit"):
            jsonl_adapter.read(url)
    finally:
        server.shutdown()


def test_get_adapter_returns_the_jsonl_adapter_by_name() -> None:
    assert get_adapter("jsonl") is jsonl_adapter


def test_get_adapter_raises_on_unknown_adapter_name() -> None:
    with pytest.raises(ValueError, match="Unknown adapter"):
        get_adapter("does-not-exist")
