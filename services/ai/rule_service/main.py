"""
rule-service: derives executable data-quality rules from privacy-safe column
profiles with a (by default local) LLM. It never receives rows.
"""

from common.health import create_app
from common.schemas import RuleDerivationRequest, RuleDerivationResponse
from rule_service.deriver import JURISDICTION_GUIDANCE, derive

app = create_app("rule-service", "1.0.0", "LLM-derived, jurisdiction-aware data quality rules.")


@app.post("/rules/derive", response_model=RuleDerivationResponse)
async def derive_rules(req: RuleDerivationRequest):
    return await derive(req)


@app.get("/jurisdictions")
async def jurisdictions():
    return JURISDICTION_GUIDANCE
