from pydantic import BaseModel, Field
from typing import List, Dict

class DQIssue(BaseModel):
    issue: str = Field(description="Brief summary of the issue")
    affected_columns: List[str] = Field(default_factory=list, description="List of columns affected by this issue")
    description: str = Field(description="Detailed explanation of the issue and its impact")

class RemediationAction(BaseModel):
    action: str = Field(description="Concrete step to fix the data quality issue")
    priority: int = Field(ge=1, le=5, description="Priority level from 1 (highest) to 5 (lowest)")
    description: str = Field(description="Explanation of how the action addresses the issue")

class GENAIInsights(BaseModel):
    data_quality_issues: Dict[str, DQIssue] = Field(description="Issues categorized by DQ dimension (Completeness, Accuracy, etc.)")
    remediation_actions: List[RemediationAction] = Field(description="List of recommended actions to improve data quality")
    regulatory_compliance_risks: List[str] = Field(default_factory=list, description="Potential compliance risks identified")
    composite_dqs: float = Field(ge=0.0, le=1.0, description="Overall data quality score (weighted average)")
    dimension_scores: Dict[str, float] = Field(description="Scores for each DQ dimension between 0.0 and 1.0")

class DQAnalysisResponse(BaseModel):
    status: str = Field(default="success", description="Status of the analysis")
    genai_insights: GENAIInsights = Field(description="Detailed AI-generated insights and recommendations")
