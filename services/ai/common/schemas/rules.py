from pydantic import BaseModel, ConfigDict, Field
from typing import Any, Dict, List, Literal, Optional

DimensionName = Literal["Completeness", "Validity", "Accuracy", "Consistency", "Uniqueness", "Timeliness", "Integrity"]

RULE_TYPES = [
    "not_null", "conditional_required", "regex", "allowed_values", "range", "length", "luhn",
    "date_parseable", "date_not_future", "date_max_age", "column_compare", "unique",
]
RuleType = Literal[
    "not_null", "conditional_required", "regex", "allowed_values", "range", "length", "luhn",
    "date_parseable", "date_not_future", "date_max_age", "column_compare", "unique",
]
CompareOp = Literal["<", "<=", ">", ">=", "==", "!="]


class RuleSpec(BaseModel):
    """A rule in the executable DSL (identical to the data-plane's rule format)."""
    model_config = ConfigDict(extra="ignore")
    id: str
    source: str = "builtin"
    dimension: DimensionName
    type: RuleType
    column: str
    params: Dict[str, Any] = Field(default_factory=dict)
    description: str = ""
    rationale: str = ""
    regulation: Optional[str] = None
    citations: List[str] = Field(default_factory=list, description="Ids of retrieved regulation clauses the rule enforces")
    approved: bool = Field(default=False, description="Reviewed and approved by a person; never held")


class RuleResult(RuleSpec):
    status: str = Field(default="applied", description="applied | held (implausible unreviewed LLM rule, not scored)")
    hold_reason: Optional[str] = None
    checked: int = 0
    violations: int = 0
    violation_ratio: float = 0.0


class RejectedRule(BaseModel):
    model_config = ConfigDict(extra="ignore")
    rule: Dict[str, Any]
    reason: str


class ColumnCheck(BaseModel):
    """Union of all rules for one (dimension, column): a value failing any rule counts once."""
    model_config = ConfigDict(extra="ignore")
    dimension: DimensionName
    column: str
    rule_ids: List[str] = Field(default_factory=list)
    checked: int = 0
    violations: int = 0
    violation_ratio: float = 0.0


class RuleEvaluation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    jurisdiction: str = "GLOBAL"
    rule_mode: str = "builtin"
    optional_columns: List[str] = Field(default_factory=list)
    freshness_days: Optional[float] = None
    suspect_ratio: Optional[float] = None
    rules: List[RuleResult] = Field(default_factory=list)
    rejected: List[RejectedRule] = Field(default_factory=list)
    column_checks: List[ColumnCheck] = Field(default_factory=list)
    derivation: Optional[Dict[str, Any]] = None


# --- LLM rule derivation contract ---

class ProposedRule(BaseModel):
    """Flat, all-fields-present shape: easier for small local models than nested params."""
    column: str = Field(description="Exact column name from the profile")
    dimension: DimensionName
    type: RuleType
    pattern: Optional[str] = Field(description="regex: full-match pattern using ^ and $; null otherwise")
    values: Optional[List[str]] = Field(description="allowed_values: the permitted values; null otherwise")
    case_sensitive: Optional[bool] = Field(description="allowed_values: whether case must match; null otherwise")
    min: Optional[float] = Field(description="range/length: lower bound; null otherwise")
    max: Optional[float] = Field(description="range/length: upper bound; null otherwise")
    when_column: Optional[str] = Field(description="conditional_required: column whose presence makes `column` required; null otherwise")
    op: Optional[CompareOp] = Field(description="column_compare: comparison operator; null otherwise")
    other_column: Optional[str] = Field(description="column_compare: right-hand column; null otherwise")
    max_age_days: Optional[float] = Field(description="date_max_age: freshness window in days; null otherwise")
    description: str = Field(description="One sentence stating the rule for a data steward")
    rationale: str = Field(description="Why this rule applies to this column in this domain and jurisdiction")
    regulation: Optional[str] = Field(description="Regulation or standard motivating the rule, or null")
    citations: Optional[List[str]] = Field(description="Ids of the regulatory context clauses this rule enforces, e.g. GDPR:Article 5; null if none apply")


class RuleProposalSet(BaseModel):
    rules: List[ProposedRule]
    optional_columns: List[str] = Field(description="Columns that may legitimately be empty; excluded from completeness scoring")


class RuleDerivationRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    dataset: Dict[str, Any]
    columns: List[Dict[str, Any]]
    categorical_stats: Dict[str, Any] = Field(default_factory=dict)
    jurisdiction: str = "GLOBAL"


class RuleDerivationResponse(BaseModel):
    rules: List[RuleSpec]
    optional_columns: List[str] = Field(default_factory=list)
    rejected: List[RejectedRule] = Field(default_factory=list)
    model: Optional[str] = None
    local_model: bool = True
    latency_ms: float = 0.0
    proposed: int = 0
    redactions: Dict[str, int] = Field(default_factory=dict)
    status: Literal["ok", "unavailable", "failed"] = "ok"
    error: Optional[str] = None
    policy_context: Dict[str, Any] = Field(default_factory=dict, description="Retrieved clauses and retrieval mode")
    citation_stats: Dict[str, Any] = Field(default_factory=dict, description="Citations made, valid, and fabricated")
