"""Tests for the Doude EGASPIN Form A draft."""

from datetime import datetime, timedelta
from pathlib import Path

import pypdf
import pytest

from engine import forms, locate, pdf_report, report


@pytest.fixture(scope="module")
def scenario():
    return locate.load_scenario()


@pytest.fixture(scope="module")
def response():
    return report.analyze()


def _extract_text(path):
    reader = pypdf.PdfReader(str(path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def test_form_a_data_deadline(response, scenario):
    data = forms.form_a_data(response, scenario)
    assert data["draft"] is True
    detected = datetime.fromisoformat(
        response["leak"]["detected_at"].replace("Z", "+00:00")
    )
    deadline = detected + timedelta(hours=24)
    assert data["incident"]["deadline_utc"] == deadline.strftime("%Y-%m-%dT%H:%M:%SZ")


def test_form_a_pdf(response, scenario, tmp_path):
    out = tmp_path / "form_a.pdf"
    forms.build_form_a(response, scenario, out)
    assert out.read_bytes().startswith(b"%PDF")
    text = _extract_text(out)
    assert "DRAFT" in text
    assert "Form A" in text


def test_no_ground_truth_in_source():
    for module in (pdf_report, forms):
        text = Path(module.__file__).read_text()
        assert "ground_truth" not in text