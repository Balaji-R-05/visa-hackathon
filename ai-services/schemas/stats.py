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
    top_values: Union[List[str], Dict[str, int]]

class TemporalStats(BaseModel):
    model_config = ConfigDict(extra="ignore")
    min_timestamp: Optional[Union[datetime, str]] = None
    max_timestamp: Optional[Union[datetime, str]] = None
    future_timestamp_ratio: Optional[float] = 0.0
    stale_record_ratio: Optional[float] = 0.0

class PatternStats(BaseModel):
    model_config = ConfigDict(extra="ignore")
    regex_match_ratio: Optional[float] = 0.0

class CrossColumnStats(BaseModel):
    model_config = ConfigDict(extra="ignore")
    duplicates_detected: bool = False
    dependent_nulls: Optional[List[Tuple[str, str]]] = []

class ComplianceFlags(BaseModel):
    model_config = ConfigDict(extra="ignore")
    kyc_fields_present: bool = False
    monetary_fields_present: bool = False
    personal_data_present: bool = False