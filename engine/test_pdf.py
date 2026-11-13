"""Tests for the Doude PDF spill report."""

import pypdf
import pytest

from engine import locate, pdf_report, report


@pytest.fixture(scope="module")
def scenario():
    return locate.load_scenario()


@pytest.fixture(scope="module")
def response():
    return report.analyze()


def _extract_text(path):
    reader = pypdf.PdfReader(str(path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def test_report_pdf_writes_valid_file(response, scenario, tmp_path):
    out = tmp_path / "report.pdf"
    result = pdf_report.build_spill_report(response, scenario, out)
    assert result == out
    data = out.read_bytes()
    assert data.startswith(b"%PDF")
    assert len(data) > 5 * 1024


def test_report_pdf_contains_key_fields(response, scenario, tmp_path):
    out = tmp_path / "report.pdf"
    pdf_report.build_spill_report(response, scenario, out)
    text = _extract_text(out)
    assert "SPL-0001" in text
    assert "{:,}".format(response["quantification"]["volume_bbl"]) in text
    assert response["report"]["report_hash"] in text


def test_no_spill_report(response, scenario, tmp_path):
    no_spill = dict(response)
    no_spill["detected"] = False
    no_spill["leak"] = None
    no_spill["quantification"] = None
    no_spill["impact"] = None
    out = tmp_path / "no_spill.pdf"
    pdf_report.build_spill_report(no_spill, scenario, out)
    assert out.read_bytes().startswith(b"%PDF")
    assert "No spill detected" in _extract_text(out)