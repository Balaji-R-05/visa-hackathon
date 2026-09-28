"""Thin client for the running system (gateway + insight-service for the ablation)."""

import os
import time
from typing import Optional

import httpx

GATEWAY = os.getenv("DQS_GATEWAY_URL", "http://127.0.0.1:5000/api")
INSIGHT = os.getenv("DQS_INSIGHT_URL", "http://127.0.0.1:8003")
TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "")
RATE_LIMIT_WAIT_S = float(os.getenv("DQS_RATE_LIMIT_WAIT_S", "65"))


class DerivationFallback(RuntimeError):
    """The job completed, but rule derivation failed and built-in rules were used instead."""


def assess_csv(csv_bytes: bytes, name: str, jurisdiction: str, rule_mode: str, narrative: bool,
               timeout_s: float = 1800, rules: Optional[str] = None) -> dict:
    with httpx.Client(timeout=120) as http:
        res = http.post(
            f"{GATEWAY}/assessments/csv",
            files={"file": (name, csv_bytes, "text/csv")},
            data={"jurisdiction": jurisdiction, "rule_mode": rule_mode, "narrative": str(narrative).lower(),
                  **({"rules": rules} if rules else {})},
        )
        res.raise_for_status()
        job_id = res.json()["job_id"]
        started = time.time()
        while time.time() - started < timeout_s:
            job = http.get(f"{GATEWAY}/assessments/{job_id}", params={"include": "metadata"}).json()
            if job["status"] == "completed":
                derivation = (job["report"].get("rules") or {}).get("derivation") or {}
                if rule_mode != "builtin" and derivation.get("status") != "ok":
                    raise DerivationFallback(derivation.get("error") or "; ".join(job.get("warnings", [])))
                return job
            if job["status"] == "failed":
                raise RuntimeError(job.get("error"))
            time.sleep(1.0)
    raise TimeoutError(f"job {job_id} did not finish")


def assess_with_retry(*args, attempts: int = 4, **kwargs) -> dict:
    """Retries jobs whose LLM step hit a provider rate limit, so no 'llm' result silently used built-in rules."""
    last: Optional[Exception] = None
    for attempt in range(attempts):
        try:
            return assess_csv(*args, **kwargs)
        except DerivationFallback as exc:
            last = exc
            print(f"    derivation fell back ({str(exc)[:90]}); waiting {RATE_LIMIT_WAIT_S:.0f}s [{attempt + 1}/{attempts}]")
            time.sleep(RATE_LIMIT_WAIT_S)
    raise RuntimeError(f"rule derivation kept failing: {last}")


def assess_with_extra(csv_bytes: bytes, name: str, jurisdiction: str, rule_mode: str, narrative: bool,
                      rules: Optional[str]) -> dict:
    """Assessment that enforces an approved rule set (JSON) instead of deriving a new one."""
    return assess_with_retry(csv_bytes, name, jurisdiction, rule_mode, narrative, rules=rules)


def llm_score(metadata: dict, attempts: int = 4) -> dict:
    headers = {"x-internal-token": TOKEN} if TOKEN else {}
    with httpx.Client(timeout=600) as http:
        for attempt in range(attempts):
            res = http.post(f"{INSIGHT}/experimental/llm-score", json=metadata, headers=headers)
            if res.status_code == 200:
                return res.json()
            print(f"    llm-score {res.status_code}: {res.text[:120]}; waiting {RATE_LIMIT_WAIT_S:.0f}s [{attempt + 1}/{attempts}]")
            time.sleep(RATE_LIMIT_WAIT_S)
    raise RuntimeError("llm-score kept failing")
