"""
audit-service: tamper-evident record of every assessment (who/what/when/which
model/which scores), holding metadata only.
"""

from typing import Any, Dict, Optional
from fastapi import HTTPException, Query
from pydantic import BaseModel, Field
from audit_service.store import AuditLog
from common.config import AUDIT_LOG_PATH
from common.health import create_app
from common.governance import redact

app = create_app("audit-service", "1.0.0", "Hash-chained audit log for data quality assessments.")
log = AuditLog(AUDIT_LOG_PATH)

ALLOWED_EVENTS = {"assessment_completed", "assessment_failed", "rules_derived", "report_exported"}


class AuditEvent(BaseModel):
    event: str
    data: Dict[str, Any] = Field(default_factory=dict)


@app.post("/events")
async def record(event: AuditEvent):
    if event.event not in ALLOWED_EVENTS:
        raise HTTPException(status_code=400, detail=f"event must be one of {sorted(ALLOWED_EVENTS)}")
    data, redactions = redact(event.data)  # defense in depth: the log must never hold data values
    if redactions:
        data["_redactions"] = redactions
    entry = log.append(event.event, data)
    return {"audit_id": entry["audit_id"], "entry_hash": entry["entry_hash"]}


@app.get("/events")
async def list_events(limit: int = Query(default=50, ge=1, le=500), dataset_id: Optional[str] = None):
    return log.list(limit=limit, dataset_id=dataset_id)


@app.get("/verify")
async def verify():
    return log.verify()
