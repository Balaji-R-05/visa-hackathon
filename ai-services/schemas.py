from pydantic import BaseModel
from typing import List, Dict, Tuple, Optional, Union
from uuid import UUID
from datetime import datetime


# -------------------- COLUMN METADATA --------------------
class ColumnMetadata(BaseModel):
    column_name: str
    inferred_data_type: str
    null_count: Optional[int] = 0
    null_ratio: Optional[float] = 0.0
    unique_count: Optional[int] = 0
    unique_ratio: Optional[float] = 0.0
    sample_values_masked: Optional[List[str]] = []

    class Config:
        extra = "ignore"


# -------------------- DATASET METADATA --------------------
class DatasetMetadata(BaseModel):
    dataset_id: Union[UUID, str]
    dataset_name: str
    row_count: int
    column_count: int
    detected_domain: str = "Payments"
    ingestion_timestamp: Union[datetime, str]

    class Config:
        extra = "ignore"


# -------------------- NUMERIC STATS --------------------
class NumericStats(BaseModel):
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    mean: Optional[float] = None
    negative_value_ratio: Optional[float] = 0.0

    class Config:
        extra = "ignore"


# -------------------- CATEGORICAL STATS --------------------
class CategoricalStats(BaseModel):
    distinct_values: int
    top_values: Union[List[str], Dict[str, int]]

    class Config:
        extra = "ignore"


# -------------------- TEMPORAL STATS --------------------
class TemporalStats(BaseModel):
    min_timestamp: Optional[Union[datetime, str]] = None
    max_timestamp: Optional[Union[datetime, str]] = None
    future_timestamp_ratio: Optional[float] = 0.0
    stale_record_ratio: Optional[float] = 0.0

    class Config:
        extra = "ignore"


# -------------------- PATTERN STATS --------------------
class PatternStats(BaseModel):
    regex_match_ratio: Optional[float] = 0.0

    class Config:
        extra = "ignore"


# -------------------- CROSS-COLUMN STATS --------------------
class CrossColumnStats(BaseModel):
    duplicates_detected: bool = False
    dependent_nulls: Optional[List[Tuple[str, str]]] = []

    class Config:
        extra = "ignore"


# -------------------- COMPLIANCE FLAGS --------------------
class ComplianceFlags(BaseModel):
    kyc_fields_present: bool = False
    monetary_fields_present: bool = False
    personal_data_present: bool = False

    class Config:
        extra = "ignore"


# -------------------- ROOT EXTRACTED METADATA --------------------
class ExtractedMetadata(BaseModel):
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
        """Parse raw JSON payload with flexible handling"""
        # Parse nested stats
        numeric_stats = {k: NumericStats(**v) for k, v in raw.get("numeric_stats", {}).items()}
        categorical_stats = {k: CategoricalStats(**v) for k, v in raw.get("categorical_stats", {}).items()}
        temporal_stats = {k: TemporalStats(**v) for k, v in raw.get("temporal_stats", {}).items()}
        patterns = {k: PatternStats(**v) for k, v in raw.get("patterns", {}).items()}
        
        cross_column = raw.get("cross_column_stats")
        cross_column_stats = CrossColumnStats(**cross_column) if cross_column else None

        return cls(
            dataset=DatasetMetadata(**raw["dataset"]),
            columns=[ColumnMetadata(**col) for col in raw.get("columns", [])],
            numeric_stats=numeric_stats,
            categorical_stats=categorical_stats,
            temporal_stats=temporal_stats,
            patterns=patterns,
            cross_column_stats=cross_column_stats,
            compliance_flags=ComplianceFlags(**raw.get("compliance_flags", {}))
        )

    class Config:
        extra = "ignore"

