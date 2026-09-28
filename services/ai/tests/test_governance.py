import json

import pytest

from audit_service.store import AuditLog
from common.governance import redact


def test_redacts_pii_and_card_numbers():
    payload = {
        "name": "https://api.example.com/tx?token=abc123&page=2",
        "notes": ["contact jane.doe@bank.com", "card 4111 1111 1111 1111", "PAN ABCDE1234F", "call +91 98765 43210"],
    }
    out, counts = redact(payload)
    text = json.dumps(out)
    for secret in ("jane.doe@bank.com", "4111 1111 1111 1111", "ABCDE1234F", "abc123", "98765"):
        assert secret not in text
    assert counts["email"] == 1 and counts["card_pan"] == 1 and counts["tax_id_pan"] == 1 and counts["url_secret"] == 1
    assert "page=2" in text


def test_leaves_aggregates_alone():
    payload = {"row_count": 1250, "ratio": 0.2184, "shape": "AAAAA9999A", "id": "1234567890123",  # 13 digits, fails Luhn
               "rule": "pan_number must match the Indian PAN format AAAAA9999A", "email_mask": "aaaa99@aaaaa.aaa"}
    out, counts = redact(payload)
    assert out == payload and counts == {}


def test_audit_chain_verifies_and_detects_tampering(tmp_path):
    log = AuditLog(str(tmp_path / "audit.jsonl"))
    for i in range(3):
        log.append("assessment_completed", {"dataset_id": f"d{i}", "composite_dqs": 0.9 + i / 100})
    assert log.verify() == {"valid": True, "entries": 3, "head": log.list(1)[0]["entry_hash"]}

    lines = (tmp_path / "audit.jsonl").read_text().splitlines()
    tampered = json.loads(lines[1])
    tampered["data"]["composite_dqs"] = 0.99
    lines[1] = json.dumps(tampered, sort_keys=True)
    (tmp_path / "audit.jsonl").write_text("\n".join(lines) + "\n")
    assert log.verify() == {"valid": False, "entries": 3, "first_invalid_line": 2}


@pytest.mark.parametrize("dataset_id,expected", [("d1", 1), (None, 3)])
def test_audit_list_filters(tmp_path, dataset_id, expected):
    log = AuditLog(str(tmp_path / "a.jsonl"))
    for i in range(3):
        log.append("assessment_completed", {"dataset_id": f"d{i}"})
    assert len(log.list(dataset_id=dataset_id)) == expected
