from pydantic import BaseModel, ConfigDict, Field
from typing import List, Dict, Optional, Union
from uuid import UUID
from datetime import datetime
from .stats import (
    NumericStats, CategoricalStats, TemporalStats, PatternStats, FormatStats, CrossColumnStats,
    ComplianceFlags, AccuracyCheck, GovernanceInfo,
)
from .rules import RuleEvaluation


class ColumnMetadata(BaseModel):
    model_config = ConfigDict(extra="ignore")
    column_name: str
    inferred_data_type: str
    semantic_type: Optional[str] = None
    sensitivity: List[str] = Field(default_factory=list)
    is_key: bool = False
    shape_signatures: List[Dict[str, Union[str, float]]] = Field(default_factory=list)
    null_count: Optional[int] = 0
    null_ratio: Optional[float] = 0.0
    unique_count: Optional[int] = 0
    unique_ratio: Optional[float] = 0.0
    sample_values_masked: Optional[List[str]] = Field(default_factory=list)

class DatasetMetadata(BaseModel):
    model_config = ConfigDict(extra="ignore")
    dataset_id: Union[UUID, str]
    dataset_name: str
    row_count: int
    column_count: int
    detected_domain: str = "Payments"
    source_type: str = "unknown"
    ingestion_timestamp: Union[datetime, str]

class ExtractedMetadata(BaseModel):
    model_config = ConfigDict(extra="ignore")
    dataset: DatasetMetadata
    columns: List[ColumnMetadata]
    numeric_stats: Optional[Dict[str, NumericStats]] = Field(default_factory=dict)
    categorical_stats: Optional[Dict[str, CategoricalStats]] = Field(default_factory=dict)
    temporal_stats: Optional[Dict[str, TemporalStats]] = Field(default_factory=dict)
    patterns: Optional[Dict[str, PatternStats]] = Field(default_factory=dict)
    format_stats: Optional[Dict[str, FormatStats]] = Field(default_factory=dict)
    accuracy_checks: Optional[Dict[str, AccuracyCheck]] = Field(default_factory=dict)
    cross_column_stats: Optional[CrossColumnStats] = None
    compliance_flags: ComplianceFlags
    governance: Optional[GovernanceInfo] = None
    rule_evaluation: Optional[RuleEvaluation] = None

    @classmethod
    def normalize(cls, raw: dict):
        """Parse raw JSON payload with Pydantic v2 validation"""
        return cls.model_validate(raw)
