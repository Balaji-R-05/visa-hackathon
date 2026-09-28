from pydantic import BaseModel, ConfigDict, Field
from typing import List, Dict, Tuple, Optional, Union
from datetime import datetime


class NumericStats(BaseModel):
    model_config = ConfigDict(extra="ignore")
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    mean: Optional[float] = None
    negative_value_ratio: Optional[float] = 0.0

class CategoricalStats(BaseModel):
    model_config = ConfigDict(extra="ignore")
    distinct_values: int
    top_values: Union[List[str], Dict[str, int]] = Field(default_factory=list)
    top_values_suppressed: bool = False
    values: List[str] = Field(default_factory=list, description="Complete list of observed values (low-cardinality, non-sensitive columns only)")

class CheckResult(BaseModel):
    """A single deterministic check over one column: `violations` out of `checked` values."""
    model_config = ConfigDict(extra="ignore")
    checked: int = 0
    violations: int = 0
    violation_ratio: float = 0.0

class TemporalStats(CheckResult):
    min_timestamp: Optional[Union[datetime, str]] = None
    max_timestamp: Optional[Union[datetime, str]] = None
    future_timestamp_ratio: Optional[float] = 0.0
    stale_record_ratio: Optional[float] = 0.0
    freshness_window_days: Optional[float] = None
    latest_record_age_days: Optional[float] = None

class PatternStats(BaseModel):
    model_config = ConfigDict(extra="ignore")
    regex_match_ratio: Optional[float] = 0.0

class FormatStats(CheckResult):
    dominant_case_ratio: Optional[float] = 1.0
    dominant_length_ratio: Optional[float] = 1.0
    check: Optional[str] = None
    check_description: Optional[str] = None

class AccuracyCheck(CheckResult):
    check: str
    check_description: str = ""

class CrossColumnStats(BaseModel):
    model_config = ConfigDict(extra="ignore")
    duplicates_detected: bool = False
    duplicate_row_count: int = 0
    duplicate_row_ratio: float = 0.0
    key_columns: List[str] = Field(default_factory=list)
    key_duplicate_ratio: Dict[str, float] = Field(default_factory=dict)
    dependent_nulls: Optional[List[Tuple[str, str]]] = Field(default_factory=list)

class ComplianceFlags(BaseModel):
    model_config = ConfigDict(extra="ignore")
    kyc_fields_present: bool = False
    monetary_fields_present: bool = False
    personal_data_present: bool = False
    pci_fields_present: bool = False
    sensitive_columns: Dict[str, List[str]] = Field(default_factory=dict)
    prohibited_data: List[str] = Field(default_factory=list)

class GovernanceInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")
    extractor_version: Optional[str] = None
    raw_values_included: bool = False
    value_level_fields: List[str] = Field(default_factory=list)
    suppressed_fields: List[str] = Field(default_factory=list)
    rows_profiled: Optional[int] = None
    row_limit: Optional[int] = None
    possibly_truncated: bool = False
    processing: Optional[str] = None
