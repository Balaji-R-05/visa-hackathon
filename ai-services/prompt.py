from langchain_core.prompts import PromptTemplate

DQ_PROMPT = PromptTemplate(
    input_variables=["metadata"],
    template="""You are a data quality expert specializing in payments domain analysis.

Analyze the dataset metadata below and identify data quality issues across seven key dimensions. Provide actionable remediation steps, assess regulatory compliance risks, and calculate quality scores.

Dataset Metadata:
{metadata}

CRITICAL OUTPUT REQUIREMENTS:
1. Return ONLY valid JSON - no markdown, no code fences, no preamble
2. All keys must use double quotes
3. genai_insights must be a nested JSON object, not a string
4. Follow the exact structure below

Required JSON Structure:
{{
    "status": "success",
    "genai_insights": {{
        "data_quality_issues": {{
            "Completeness": {{
                "issue": "Description of completeness issues or 'None detected'",
                "affected_columns": ["column1", "column2"],
                "description": "Detailed explanation of missing data patterns"
            }},
            "Accuracy": {{
                "issue": "Description of accuracy issues or 'None detected'",
                "affected_columns": ["column1", "column2"],
                "description": "Detailed explanation of data accuracy problems"
            }},
            "Consistency": {{
                "issue": "Description of consistency issues or 'None detected'",
                "affected_columns": ["column1", "column2"],
                "description": "Detailed explanation of inconsistencies across records"
            }},
            "Validity": {{
                "issue": "Description of validity issues or 'None detected'",
                "affected_columns": ["column1", "column2"],
                "description": "Detailed explanation of format/constraint violations"
            }},
            "Timeliness": {{
                "issue": "Description of timeliness issues or 'None detected'",
                "affected_columns": ["column1", "column2"],
                "description": "Detailed explanation of outdated or delayed data"
            }},
            "Uniqueness": {{
                "issue": "Description of uniqueness issues or 'None detected'",
                "affected_columns": ["column1", "column2"],
                "description": "Detailed explanation of duplicate records"
            }},
            "Integrity": {{
                "issue": "Description of integrity issues or 'None detected'",
                "affected_columns": ["column1", "column2"],
                "description": "Detailed explanation of referential integrity problems"
            }}
        }},
        "remediation_actions": [
            {{
                "action": "Specific action to address highest priority issue",
                "priority": 1,
                "description": "Detailed steps and expected impact"
            }},
            {{
                "action": "Specific action to address second priority issue",
                "priority": 2,
                "description": "Detailed steps and expected impact"
            }},
            {{
                "action": "Specific action to address third priority issue",
                "priority": 3,
                "description": "Detailed steps and expected impact"
            }}
        ],
        "regulatory_compliance_risks": [
            "List specific risks related to PCI-DSS, GDPR, PSD2, or other payment regulations",
            "Include potential impact on compliance if issues are not addressed"
        ],
        "composite_dqs": 0.85,
        "dimension_scores": {{
            "Completeness": 0.90,
            "Validity": 0.85,
            "Consistency": 0.88,
            "Timeliness": 0.80,
            "Uniqueness": 0.92,
            "Accuracy": 0.87
        }}
    }}
}}

Analysis Guidelines:
- Completeness: Check for missing values, null percentages, required field coverage
- Accuracy: Evaluate correctness of values, outliers, range violations
- Consistency: Look for format inconsistencies, contradictory values, standard deviations
- Validity: Assess schema compliance, data type correctness, constraint adherence
- Timeliness: Consider data freshness, update frequency, temporal gaps
- Uniqueness: Identify duplicate records, primary key violations
- Integrity: Check referential integrity, orphaned records, relationship violations

Scoring:
- Each dimension score: 0.0 (worst) to 1.0 (perfect)
- Composite DQS: weighted average of all dimension scores
- Base scores on severity and prevalence of issues found

Regulatory Context (Payments Domain):
- PCI-DSS: Cardholder data protection, tokenization, encryption
- GDPR: Personal data handling, consent, data minimization
- PSD2: Strong customer authentication, transaction monitoring
- AML/KYC: Customer identification, transaction reporting"""
)