from pydantic import BaseModel, ConfigDict, Field
from typing import List, Dict, Optional, Union
from uuid import UUID
from datetime import datetime
from .stats import NumericStats, CategoricalStats, TemporalStats, PatternStats, CrossColumnStats, ComplianceFlags

class ColumnMetadata(BaseModel):
    model_config = ConfigDict(extra="ignore")
    column_name: str
    inferred_data_type: str
    null_count: Optional[int] = 0
    null_ratio: Optional[float] = 0.0
    unique_count: Optional[int] = 0
    unique_ratio: Optional[float] = 0.0
    sample_values_masked: Optional[List[str]] = []

class DatasetMetadata(BaseModel):
    model_config = ConfigDict(extra="ignore")
    dataset_id: Union[UUID, str]
    dataset_name: str
    row_count: int
    column_count: int
    detected_domain: str = "Payments"
    ingestion_timestamp: Union[datetime, str]

class ExtractedMetadata(BaseModel):
    model_config = ConfigDict(extra="ignore")
    dataset: DatasetMetadata
    columns: List[ColumnMetadata]
    numeric_stats: Optional[Dict[str, NumericStats]] = {}
    categorical_stats: Optional[Dict[str, CategoricalStats]] = {}
    temporal_stats: Optional[Dict[str, TemporalStats]] = {}
    patterns: Optional[Dict[str, PatternStats]] = {}
    cross_column_stats: Optional[CrossColumnStats] = None
    compliance_flags: ComplianceFlags

    @classmethod
    def normalize(cls, raw: dict):
        """Parse raw JSON payload with Pydantic v2 validation"""
        return cls.model_validate(raw)
