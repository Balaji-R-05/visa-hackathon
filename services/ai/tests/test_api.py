import importlib

import pytest
from fastapi.testclient import TestClient

SERVICES = ["scoring_service", "rule_service", "insight_service", "audit_service", "policy_service"]


@pytest.mark.parametrize("service", SERVICES)
def test_health(service):
    app = importlib.import_module(f"{service}.main").app
    body = TestClient(app).get("/health").json()
    assert body["status"] == "healthy" and body["llm"] is None


def test_score_endpoint(raw_metadata):
    from scoring_service.main import app

    res = TestClient(app).post("/score", json=raw_metadata)
    assert res.status_code == 200, res.text
    body = res.json()
    assert 0 <= body["composite_dqs"] <= 1
    assert body["narrative_source"] == "template"
    assert body["governance"]["raw_values_included"] is False


def test_legacy_rule_endpoint_still_works(raw_metadata):
    from scoring_service.main import app

    res = TestClient(app).post("/score/legacy-rules", json=raw_metadata)
    assert res.status_code == 200, res.text
    assert set(res.json()["dimension_scores"]) >= {"Completeness", "Uniqueness"}


def test_insights_without_llm_returns_engine_report(raw_metadata):
    from insight_service.main import app as insight_app
    from scoring_service.main import app as scoring_app

    report = TestClient(scoring_app).post("/score", json=raw_metadata).json()
    client = TestClient(insight_app)
    res = client.post("/insights", json=report)
    assert res.status_code == 200 and res.json()["narrative_source"] == "template"
    md = client.post("/export-report", json=res.json()).json()["markdown"]
    assert "## Dimension scores" in md and report["metadata_fingerprint"] in md


def test_llm_endpoints_report_unavailable(raw_metadata):
    from insight_service.main import app

    assert TestClient(app).post("/experimental/llm-score", json=raw_metadata).status_code == 503


def test_internal_token_is_enforced(monkeypatch, raw_metadata):
    from common import config
    from scoring_service.main import app

    monkeypatch.setattr(config, "INTERNAL_SERVICE_TOKEN", "s3cret")
    client = TestClient(app)
    assert client.get("/health").status_code == 200
    assert client.post("/score", json=raw_metadata).status_code == 401
    assert client.post("/score", json=raw_metadata, headers={"x-internal-token": "s3cret"}).status_code == 200


def test_audit_endpoints(tmp_path, monkeypatch):
    from audit_service import main
    from audit_service.store import AuditLog

    monkeypatch.setattr(main, "log", AuditLog(str(tmp_path / "a.jsonl")))
    client = TestClient(main.app)
    assert client.post("/events", json={"event": "bogus"}).status_code == 400
    res = client.post("/events", json={"event": "assessment_completed", "data": {"dataset_id": "x", "note": "a@b.com"}})
    assert res.status_code == 200
    stored = client.get("/events").json()[0]
    assert stored["data"]["note"] == "[REDACTED:email]"
    assert client.get("/verify").json()["valid"] is True
