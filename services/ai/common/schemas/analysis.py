from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Literal


DIMENSIONS = ["Completeness", "Validity", "Accuracy", "Consistency", "Uniqueness", "Timeliness", "Integrity"]


class DQIssue(BaseModel):
    dimension: str = Field(description="The data quality dimension (Completeness, Accuracy, etc.)")
    issue: str = Field(default="No issues identified", description="Brief summary of the issue")
    affected_columns: List[str] = Field(default_factory=list, description="List of columns affected by this issue")
    description: str = Field(default="No specific issues were identified for this dimension.", description="Detailed explanation of the issue and its impact")

class RemediationAction(BaseModel):
    action: str = Field(description="Concrete step to fix the data quality issue")
    priority: int = Field(ge=1, le=5, description="Priority level from 1 (most urgent) to 5 (least urgent)")
    description: str = Field(default="", description="Explanation of how the action addresses the issue")
    dimension: Optional[str] = None
    finding_ids: List[str] = Field(default_factory=list)
    severity: Optional[str] = None
    expected_gain: Optional[float] = Field(default=None, description="Composite DQS points recovered if the finding is fully fixed")


# --- LLM-as-scorer contract (ablation baseline; also the legacy rule-only output shape) ---

class DimensionScores(BaseModel):
    Completeness: float = Field(ge=0.0, le=1.0, description="1 - average null_ratio across columns")
    Accuracy: float = Field(ge=0.0, le=1.0, description="Derived from out-of-range/negative-value ratios")
    Consistency: float = Field(ge=0.0, le=1.0, description="Derived from dominant_case_ratio and dominant_length_ratio")
    Validity: float = Field(ge=0.0, le=1.0, description="Derived from regex_match_ratio and format violations")
    Timeliness: float = Field(ge=0.0, le=1.0, description="1 - average(future_timestamp_ratio + stale_record_ratio)")
    Uniqueness: float = Field(ge=0.0, le=1.0, description="Derived from unique_ratio on identifier-like columns")
    Integrity: float = Field(ge=0.0, le=1.0, description="Derived from cross-column/dependent-null consistency")

    def as_dict(self) -> Dict[str, float]:
        return self.model_dump()

class LLMScoredResponse(BaseModel):
    status: str = Field(default="success", description="Status indicator")
    data_quality_issues: List[DQIssue] = Field(description="List of issues categorized by dimension")
    remediation_actions: List[RemediationAction] = Field(description="List of recommended actions to improve data quality")
    regulatory_compliance_risks: List[Any] = Field(default_factory=list, description="Potential compliance risks identified")
    composite_dqs: float = Field(ge=0.0, le=1.0, description="Overall data quality score (weighted average)")
    dimension_scores: DimensionScores = Field(description="Scores for each DQ dimension between 0.0 and 1.0")


# --- Deterministic engine report (the authoritative DQS) ---

class ColumnEvidence(BaseModel):
    column: str
    check: str
    description: str = ""
    checked: int
    violations: int
    violation_ratio: float

class DimensionResult(BaseModel):
    dimension: str
    applicable: bool
    score: Optional[float] = None
    weight: float = Field(description="Effective weight in the composite after renormalizing over applicable dimensions")
    base_weight: float
    reason: str = Field(description="Why the dimension was or was not scored for this dataset")
    formula: str
    checked: int = 0
    violations: int = 0
    affected_columns: List[str] = Field(default_factory=list)
    evidence: List[ColumnEvidence] = Field(default_factory=list)
    explanation: str = ""
    narrative: Optional[str] = None

class Finding(BaseModel):
    id: str
    dimension: str
    columns: List[str]
    check: str
    description: str
    violations: int
    checked: int
    violation_ratio: float
    severity: Literal["critical", "high", "medium", "low"]
    impact: float = Field(description="Composite DQS points lost to this finding")
    regulatory_context: Optional[str] = None

class GroundingReport(BaseModel):
    numeric_claims: int
    verified: int
    unverified_claims: List[str] = Field(default_factory=list)
    rounded_claims: List[str] = Field(default_factory=list, description="Unverified claims within 1 point of a true value (rounding, not fabrication)")
    score: Optional[float] = Field(default=None, description="verified / numeric_claims; None when the text makes no numeric claims")

class DQSReport(BaseModel):
    status: str = "success"
    report_version: str
    engine_version: str
    scoring_profile: str
    composite_dqs: float = Field(ge=0.0, le=1.0)
    grade: str
    dimension_scores: Dict[str, float] = Field(description="Scores of applicable dimensions only")
    dimensions: List[DimensionResult]
    findings: List[Finding]
    data_quality_issues: List[DQIssue]
    remediation_actions: List[RemediationAction]
    regulatory_compliance_risks: List[str] = Field(default_factory=list)
    executive_summary: str = ""
    narrative_source: Literal["llm", "template"] = "template"
    narrative_model: Optional[str] = None
    grounding: Optional[GroundingReport] = None
    rules: Dict[str, Any] = Field(default_factory=dict, description="Rules applied/rejected, by source")
    governance: Dict[str, Any] = Field(default_factory=dict)
    metadata_fingerprint: str
    audit_id: Optional[str] = None
    dataset: Dict[str, Any] = Field(default_factory=dict)


# Kept for callers that still import the old name.
DQAnalysisResponse = LLMScoredResponse
