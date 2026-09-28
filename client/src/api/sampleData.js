// A real report produced by the pipeline (synthetic high-severity benchmark, IN, hybrid rules,
// groq/openai/gpt-oss-20b) for the offline demo. Regenerate rather than hand-edit.
export const SAMPLE_ANALYSIS_RESULT = {
  "status": "success",
  "report_version": "2.0",
  "engine_version": "1.0.0",
  "scoring_profile": "payments",
  "composite_dqs": 0.9083,
  "grade": "B (Good)",
  "dimension_scores": {
    "Completeness": 0.8892,
    "Validity": 0.9481,
    "Accuracy": 1,
    "Consistency": 0.936,
    "Uniqueness": 0.8,
    "Timeliness": 0.772,
    "Integrity": 1
  },
  "dimensions": [
    {
      "dimension": "Completeness",
      "applicable": true,
      "score": 0.8892,
      "weight": 0.2,
      "base_weight": 0.2,
      "reason": "scored from 11 check(s) over transaction_id, customer_id, amount, currency, txn_timestamp, merchant_name, payment_method, status, pan_number, email, kyc_address",
      "formula": "1 − empty required cells ÷ required cells (pooled over required columns)",
      "checked": 13750,
      "violations": 1523,
      "affected_columns": [
        "customer_id",
        "amount",
        "email",
        "kyc_address"
      ],
      "evidence": [
        {
          "column": "transaction_id",
          "check": "not_null [builtin/llm]",
          "description": "transaction_id must be populated; Transaction ID must always be present",
          "checked": 1250,
          "violations": 0,
          "violation_ratio": 0
        },
        {
          "column": "customer_id",
          "check": "not_null [builtin/llm]",
          "description": "customer_id must be populated; Customer identifier must be present for every transaction",
          "checked": 1250,
          "violations": 377,
          "violation_ratio": 0.3016
        },
        {
          "column": "amount",
          "check": "not_null [builtin]",
          "description": "amount must be populated",
          "checked": 1250,
          "violations": 367,
          "violation_ratio": 0.2936
        },
        {
          "column": "currency",
          "check": "not_null [builtin]",
          "description": "currency must be populated",
          "checked": 1250,
          "violations": 0,
          "violation_ratio": 0
        },
        {
          "column": "txn_timestamp",
          "check": "not_null [builtin]",
          "description": "txn_timestamp must be populated",
          "checked": 1250,
          "violations": 0,
          "violation_ratio": 0
        },
        {
          "column": "merchant_name",
          "check": "not_null [builtin]",
          "description": "merchant_name must be populated",
          "checked": 1250,
          "violations": 0,
          "violation_ratio": 0
        },
        {
          "column": "payment_method",
          "check": "not_null [builtin]",
          "description": "payment_method must be populated",
          "checked": 1250,
          "violations": 0,
          "violation_ratio": 0
        },
        {
          "column": "status",
          "check": "not_null [builtin]",
          "description": "status must be populated",
          "checked": 1250,
          "violations": 0,
          "violation_ratio": 0
        },
        {
          "column": "pan_number",
          "check": "not_null [builtin]",
          "description": "pan_number must be populated",
          "checked": 1250,
          "violations": 0,
          "violation_ratio": 0
        },
        {
          "column": "email",
          "check": "not_null [builtin]",
          "description": "email must be populated",
          "checked": 1250,
          "violations": 368,
          "violation_ratio": 0.2944
        },
        {
          "column": "kyc_address",
          "check": "not_null [builtin/llm]",
          "description": "kyc_address must be populated; KYC address must be provided for every customer",
          "checked": 1250,
          "violations": 411,
          "violation_ratio": 0.3288
        }
      ],
      "explanation": "Completeness = 0.889 (1 − 1,523 ÷ 13,750). 4 of 11 assessed columns have violations; the worst is kyc_address: 411 of 1,250 (32.9%) fail 'kyc_address must be populated; KYC address must be provided for every customer'.",
      "narrative": "Completeness at 0.8892 means that 88.92% of required cells are populated. Missing values in key columns such as kyc_address (411 violations), customer_id (377 violations), email (368 violations), and amount (367 violations) can lead to incomplete settlement records and inaccurate risk assessments."
    },
    {
      "dimension": "Validity",
      "applicable": true,
      "score": 0.9481,
      "weight": 0.2,
      "base_weight": 0.2,
      "reason": "scored from 7 check(s) over amount, currency, txn_timestamp, pan_number, email, payment_method, status",
      "formula": "1 − values failing ≥1 format/domain rule ÷ values checked (pooled over rule-bearing columns)",
      "checked": 8015,
      "violations": 416,
      "affected_columns": [
        "amount",
        "pan_number"
      ],
      "evidence": [
        {
          "column": "amount",
          "check": "range [builtin]",
          "description": "amount must be numeric and non-negative",
          "checked": 883,
          "violations": 143,
          "violation_ratio": 0.16194790486976218
        },
        {
          "column": "currency",
          "check": "allowed_values [builtin/llm]",
          "description": "currency must be an ISO 4217 currency code; Currency code must be a valid ISO 4217 code",
          "checked": 1250,
          "violations": 0,
          "violation_ratio": 0
        },
        {
          "column": "txn_timestamp",
          "check": "date_parseable [builtin]",
          "description": "txn_timestamp must be a parseable date/time",
          "checked": 1250,
          "violations": 0,
          "violation_ratio": 0
        },
        {
          "column": "pan_number",
          "check": "regex [builtin/llm]",
          "description": "pan_number must match the Indian PAN format AAAAA9999A; PAN must match the Indian format: five letters, four digits, one letter",
          "checked": 1250,
          "violations": 273,
          "violation_ratio": 0.2184
        },
        {
          "column": "email",
          "check": "regex [builtin/llm]",
          "description": "email must be a well-formed email address; Email addresses must follow standard email format",
          "checked": 882,
          "violations": 0,
          "violation_ratio": 0
        },
        {
          "column": "payment_method",
          "check": "allowed_values [llm]",
          "description": "Payment method must be one of the predefined categories",
          "checked": 1250,
          "violations": 0,
          "violation_ratio": 0
        },
        {
          "column": "status",
          "check": "allowed_values [llm]",
          "description": "Transaction status must be one of SUCCESS, FAILED, or PENDING",
          "checked": 1250,
          "violations": 0,
          "violation_ratio": 0
        }
      ],
      "explanation": "Validity = 0.948 (1 − 416 ÷ 8,015). 2 of 7 assessed columns have violations; the worst is pan_number: 273 of 1,250 (21.8%) fail 'pan_number must match the Indian PAN format AAAAA9999A; PAN must match the Indian format: five letters, four digits, one letter'.",
      "narrative": "Validity at 0.9481 shows that 94.81% of values meet format and domain rules. However, 21.8% of pan_number entries (273 violations) fail to match the Indian PAN format, and 16.2% of amount entries (143 violations) are non‑numeric or negative, potentially causing fraud model errors and regulatory misreporting."
    },
    {
      "dimension": "Accuracy",
      "applicable": true,
      "score": 1,
      "weight": 0.1,
      "base_weight": 0.1,
      "reason": "scored from 1 check(s) over amount",
      "formula": "1 − implausible values ÷ values checked (IQR outliers on amounts and accuracy rules)",
      "checked": 740,
      "violations": 0,
      "affected_columns": [],
      "evidence": [
        {
          "column": "amount",
          "check": "iqr_outlier [statistical]",
          "description": "non-negative amounts beyond Q1/Q3 ± 3×IQR (plausibility proxy; no reference source available)",
          "checked": 740,
          "violations": 0,
          "violation_ratio": 0
        }
      ],
      "explanation": "Accuracy = 1.000 (1 − 0 ÷ 740). The assessed column passes.",
      "narrative": "Accuracy is perfect (1.000), indicating no implausible amounts were detected. This gives confidence that the monetary values used for settlement and reporting are reliable."
    },
    {
      "dimension": "Consistency",
      "applicable": true,
      "score": 0.936,
      "weight": 0.1,
      "base_weight": 0.1,
      "reason": "scored from 7 check(s) over transaction_id, customer_id, currency, merchant_name, payment_method, status, pan_number",
      "formula": "1 − values deviating from the column's dominant representation ÷ values checked",
      "checked": 8373,
      "violations": 536,
      "affected_columns": [
        "currency",
        "pan_number"
      ],
      "evidence": [
        {
          "column": "transaction_id",
          "check": "fixed_format [statistical]",
          "description": "values deviating from the dominant length (9) or case (upper)",
          "checked": 1250,
          "violations": 0,
          "violation_ratio": 0
        },
        {
          "column": "customer_id",
          "check": "fixed_format [statistical]",
          "description": "values deviating from the dominant length (8) or case (upper)",
          "checked": 873,
          "violations": 0,
          "violation_ratio": 0
        },
        {
          "column": "currency",
          "check": "case_variant [statistical]",
          "description": "values that are a non-dominant case/whitespace spelling of the same code",
          "checked": 1250,
          "violations": 263,
          "violation_ratio": 0.2104
        },
        {
          "column": "merchant_name",
          "check": "case_variant [statistical]",
          "description": "values that are a non-dominant case/whitespace spelling of the same code",
          "checked": 1250,
          "violations": 0,
          "violation_ratio": 0
        },
        {
          "column": "payment_method",
          "check": "case_variant [statistical]",
          "description": "values that are a non-dominant case/whitespace spelling of the same code",
          "checked": 1250,
          "violations": 0,
          "violation_ratio": 0
        },
        {
          "column": "status",
          "check": "case_variant [statistical]",
          "description": "values that are a non-dominant case/whitespace spelling of the same code",
          "checked": 1250,
          "violations": 0,
          "violation_ratio": 0
        },
        {
          "column": "pan_number",
          "check": "fixed_format [statistical]",
          "description": "values deviating from the dominant length (10) or case (upper)",
          "checked": 1250,
          "violations": 273,
          "violation_ratio": 0.2184
        }
      ],
      "explanation": "Consistency = 0.936 (1 − 536 ÷ 8,373). 2 of 7 assessed columns have violations; the worst is pan_number: 273 of 1,250 (21.8%) fail 'values deviating from the dominant length (10) or case (upper)'.",
      "narrative": "Consistency at 0.936 means 93.6% of values align with dominant representations. Deviations in pan_number (21.8% violations) and currency (21.0% violations) can create duplicate records and misinterpretation in analytics pipelines."
    },
    {
      "dimension": "Uniqueness",
      "applicable": true,
      "score": 0.8,
      "weight": 0.15,
      "base_weight": 0.15,
      "reason": "scored from 2 check(s) over transaction_id, (all columns)",
      "formula": "1 − max(duplicate-row ratio, duplicate-key ratio)",
      "checked": 2500,
      "violations": 500,
      "affected_columns": [
        "transaction_id",
        "(all columns)"
      ],
      "evidence": [
        {
          "column": "transaction_id",
          "check": "unique [llm]",
          "description": "Each transaction must have a distinct identifier",
          "checked": 1250,
          "violations": 250,
          "violation_ratio": 0.2
        },
        {
          "column": "(all columns)",
          "check": "duplicate_rows [statistical]",
          "description": "exact duplicate rows",
          "checked": 1250,
          "violations": 250,
          "violation_ratio": 0.2
        }
      ],
      "explanation": "Uniqueness = 0.800 (1 − worst duplicate ratio 20.0%). 2 of 2 assessed columns have violations; the worst is transaction_id: 250 of 1,250 (20.0%) fail 'Each transaction must have a distinct identifier'.",
      "narrative": "Uniqueness at 0.800 reflects that 80.0% of rows are unique. Duplicate transaction_id (20.0% violations) and exact duplicate rows (20.0% violations) risk double‑counting in settlement and fraud detection."
    },
    {
      "dimension": "Timeliness",
      "applicable": true,
      "score": 0.772,
      "weight": 0.1,
      "base_weight": 0.1,
      "reason": "scored from 1 check(s) over txn_timestamp",
      "formula": "1 − future-dated or out-of-window timestamps ÷ timestamps checked",
      "checked": 1250,
      "violations": 285,
      "affected_columns": [
        "txn_timestamp"
      ],
      "evidence": [
        {
          "column": "txn_timestamp",
          "check": "date_not_future+date_max_age [builtin/llm]",
          "description": "txn_timestamp must not be in the future; txn_timestamp must be within the 365-day freshness window; Transaction timestamp cannot be in the future",
          "checked": 1250,
          "violations": 285,
          "violation_ratio": 0.228
        }
      ],
      "explanation": "Timeliness = 0.772 (1 − 285 ÷ 1,250). 1 of 1 assessed column has violations; the worst is txn_timestamp: 285 of 1,250 (22.8%) fail 'txn_timestamp must not be in the future; txn_timestamp must be within the 365-day freshness window; Transaction timestamp cannot be in the future'.",
      "narrative": "Timeliness at 0.772 indicates that 77.2% of timestamps are within the acceptable 365‑day window. 22.8% of txn_timestamp values (285 violations) are future‑dated, which can invalidate time‑based fraud rules and delay settlement."
    },
    {
      "dimension": "Integrity",
      "applicable": true,
      "score": 1,
      "weight": 0.15,
      "base_weight": 0.15,
      "reason": "scored from 2 check(s) over transaction_id, currency",
      "formula": "1 − key/dependency rule violations ÷ rows checked",
      "checked": 2133,
      "violations": 0,
      "affected_columns": [],
      "evidence": [
        {
          "column": "transaction_id",
          "check": "not_null [builtin]",
          "description": "key column transaction_id must never be empty",
          "checked": 1250,
          "violations": 0,
          "violation_ratio": 0
        },
        {
          "column": "currency",
          "check": "conditional_required [builtin]",
          "description": "every amount must carry a currency",
          "checked": 883,
          "violations": 0,
          "violation_ratio": 0
        }
      ],
      "explanation": "Integrity = 1.000 (1 − 0 ÷ 2,133). All 2 assessed columns pass.",
      "narrative": "Integrity is perfect (1.000), confirming that all key/dependency rules are satisfied. This ensures relational consistency across the dataset."
    }
  ],
  "findings": [
    {
      "id": "F1",
      "dimension": "Validity",
      "columns": [
        "pan_number"
      ],
      "check": "regex [builtin/llm]",
      "description": "pan_number must match the Indian PAN format AAAAA9999A; PAN must match the Indian format: five letters, four digits, one letter",
      "violations": 273,
      "checked": 1250,
      "violation_ratio": 0.2184,
      "severity": "critical",
      "impact": 0.006812,
      "regulatory_context": "Income Tax Act, 1961 s.139A (PAN); RBI KYC Master Direction"
    },
    {
      "id": "F2",
      "dimension": "Completeness",
      "columns": [
        "kyc_address"
      ],
      "check": "not_null [builtin/llm]",
      "description": "kyc_address must be populated; KYC address must be provided for every customer",
      "violations": 411,
      "checked": 1250,
      "violation_ratio": 0.3288,
      "severity": "critical",
      "impact": 0.005978,
      "regulatory_context": "RBI KYC Master Direction"
    },
    {
      "id": "F3",
      "dimension": "Uniqueness",
      "columns": [
        "transaction_id"
      ],
      "check": "unique [llm]",
      "description": "Each transaction must have a distinct identifier",
      "violations": 250,
      "checked": 1250,
      "violation_ratio": 0.2,
      "severity": "high",
      "impact": 0.03,
      "regulatory_context": null
    },
    {
      "id": "F4",
      "dimension": "Uniqueness",
      "columns": [
        "(all columns)"
      ],
      "check": "duplicate_rows [statistical]",
      "description": "exact duplicate rows",
      "violations": 250,
      "checked": 1250,
      "violation_ratio": 0.2,
      "severity": "high",
      "impact": 0.03,
      "regulatory_context": null
    },
    {
      "id": "F5",
      "dimension": "Timeliness",
      "columns": [
        "txn_timestamp"
      ],
      "check": "date_not_future+date_max_age [builtin/llm]",
      "description": "txn_timestamp must not be in the future; txn_timestamp must be within the 365-day freshness window; Transaction timestamp cannot be in the future",
      "violations": 285,
      "checked": 1250,
      "violation_ratio": 0.228,
      "severity": "high",
      "impact": 0.0228,
      "regulatory_context": "DPDP Act 2023"
    },
    {
      "id": "F6",
      "dimension": "Completeness",
      "columns": [
        "customer_id"
      ],
      "check": "not_null [builtin/llm]",
      "description": "customer_id must be populated; Customer identifier must be present for every transaction",
      "violations": 377,
      "checked": 1250,
      "violation_ratio": 0.3016,
      "severity": "high",
      "impact": 0.005484,
      "regulatory_context": "Risk-data completeness (BCBS 239 Principle 4)"
    },
    {
      "id": "F7",
      "dimension": "Completeness",
      "columns": [
        "email"
      ],
      "check": "not_null [builtin]",
      "description": "email must be populated",
      "violations": 368,
      "checked": 1250,
      "violation_ratio": 0.2944,
      "severity": "high",
      "impact": 0.005353,
      "regulatory_context": "Personal-data accuracy principle (GDPR Art. 5(1)(d); India DPDP Act 2023 s.8(3))"
    },
    {
      "id": "F8",
      "dimension": "Completeness",
      "columns": [
        "amount"
      ],
      "check": "not_null [builtin]",
      "description": "amount must be populated",
      "violations": 367,
      "checked": 1250,
      "violation_ratio": 0.2936,
      "severity": "high",
      "impact": 0.005338,
      "regulatory_context": "Risk-data completeness (BCBS 239 Principle 4)"
    },
    {
      "id": "F9",
      "dimension": "Consistency",
      "columns": [
        "pan_number"
      ],
      "check": "fixed_format [statistical]",
      "description": "values deviating from the dominant length (10) or case (upper)",
      "violations": 273,
      "checked": 1250,
      "violation_ratio": 0.2184,
      "severity": "high",
      "impact": 0.00326,
      "regulatory_context": null
    },
    {
      "id": "F10",
      "dimension": "Consistency",
      "columns": [
        "currency"
      ],
      "check": "case_variant [statistical]",
      "description": "values that are a non-dominant case/whitespace spelling of the same code",
      "violations": 263,
      "checked": 1250,
      "violation_ratio": 0.2104,
      "severity": "high",
      "impact": 0.003141,
      "regulatory_context": null
    },
    {
      "id": "F11",
      "dimension": "Validity",
      "columns": [
        "amount"
      ],
      "check": "range [builtin]",
      "description": "amount must be numeric and non-negative",
      "violations": 143,
      "checked": 883,
      "violation_ratio": 0.16194790486976218,
      "severity": "medium",
      "impact": 0.003568,
      "regulatory_context": null
    }
  ],
  "data_quality_issues": [
    {
      "dimension": "Completeness",
      "issue": "411 of 1,250 values in kyc_address fail: kyc_address must be populated; KYC address must be provided for every customer",
      "affected_columns": [
        "customer_id",
        "amount",
        "email",
        "kyc_address"
      ],
      "description": "Completeness = 0.889 (1 − 1,523 ÷ 13,750). 4 of 11 assessed columns have violations; the worst is kyc_address: 411 of 1,250 (32.9%) fail 'kyc_address must be populated; KYC address must be provided for every customer'."
    },
    {
      "dimension": "Validity",
      "issue": "273 of 1,250 values in pan_number fail: pan_number must match the Indian PAN format AAAAA9999A; PAN must match the Indian format: five letters, four digits, one letter",
      "affected_columns": [
        "amount",
        "pan_number"
      ],
      "description": "Validity = 0.948 (1 − 416 ÷ 8,015). 2 of 7 assessed columns have violations; the worst is pan_number: 273 of 1,250 (21.8%) fail 'pan_number must match the Indian PAN format AAAAA9999A; PAN must match the Indian format: five letters, four digits, one letter'."
    },
    {
      "dimension": "Accuracy",
      "issue": "No issues identified",
      "affected_columns": [],
      "description": "Accuracy = 1.000 (1 − 0 ÷ 740). The assessed column passes."
    },
    {
      "dimension": "Consistency",
      "issue": "273 of 1,250 values in pan_number fail: values deviating from the dominant length (10) or case (upper)",
      "affected_columns": [
        "currency",
        "pan_number"
      ],
      "description": "Consistency = 0.936 (1 − 536 ÷ 8,373). 2 of 7 assessed columns have violations; the worst is pan_number: 273 of 1,250 (21.8%) fail 'values deviating from the dominant length (10) or case (upper)'."
    },
    {
      "dimension": "Uniqueness",
      "issue": "250 of 1,250 values in transaction_id fail: Each transaction must have a distinct identifier",
      "affected_columns": [
        "transaction_id",
        "(all columns)"
      ],
      "description": "Uniqueness = 0.800 (1 − worst duplicate ratio 20.0%). 2 of 2 assessed columns have violations; the worst is transaction_id: 250 of 1,250 (20.0%) fail 'Each transaction must have a distinct identifier'."
    },
    {
      "dimension": "Timeliness",
      "issue": "285 of 1,250 values in txn_timestamp fail: txn_timestamp must not be in the future; txn_timestamp must be within the 365-day freshness window; Transaction timestamp cannot be in the future",
      "affected_columns": [
        "txn_timestamp"
      ],
      "description": "Timeliness = 0.772 (1 − 285 ÷ 1,250). 1 of 1 assessed column has violations; the worst is txn_timestamp: 285 of 1,250 (22.8%) fail 'txn_timestamp must not be in the future; txn_timestamp must be within the 365-day freshness window; Transaction timestamp cannot be in the future'."
    },
    {
      "dimension": "Integrity",
      "issue": "No issues identified",
      "affected_columns": [],
      "description": "Integrity = 1.000 (1 − 0 ÷ 2,133). All 2 assessed columns pass."
    }
  ],
  "remediation_actions": [
    {
      "action": "Standardize all pan_number values to the 10‑character uppercase format AAAAA9999A and flag or correct the 273 non‑conforming entries.",
      "priority": 1,
      "description": "Correcting PAN format removes 21.8% of validity violations, ensuring accurate customer identification for KYC compliance and fraud detection.",
      "dimension": "Validity",
      "finding_ids": [
        "F1"
      ],
      "severity": "critical",
      "expected_gain": 0.0068
    },
    {
      "action": "Populate kyc_address for the 411 rows lacking this field, using verified customer records or prompting for missing data.",
      "priority": 1,
      "description": "Filling 32.9% of missing KYC addresses satisfies RBI KYC Master Direction and prevents regulatory reporting gaps.",
      "dimension": "Completeness",
      "finding_ids": [
        "F2"
      ],
      "severity": "critical",
      "expected_gain": 0.006
    },
    {
      "action": "Generate unique transaction_id values for the 250 duplicate rows and enforce a uniqueness constraint on the transaction_id column.",
      "priority": 2,
      "description": "Eliminating 20.0% duplicate identifiers prevents double‑counting in settlement and fraud models.",
      "dimension": "Uniqueness",
      "finding_ids": [
        "F3"
      ],
      "severity": "high",
      "expected_gain": 0.03
    },
    {
      "action": "Remove or merge the 250 exact duplicate rows identified across all columns.",
      "priority": 2,
      "description": "Removing 20.0% duplicate rows cleans the dataset, improving accuracy of analytics and reporting.",
      "dimension": "Uniqueness",
      "finding_ids": [
        "F4"
      ],
      "severity": "high",
      "expected_gain": 0.03
    },
    {
      "action": "Validate and correct the 285 txn_timestamp entries that are future‑dated or outside the 365‑day window.",
      "priority": 2,
      "description": "Fixing 22.8% of timeliness violations ensures time‑based fraud rules and settlement timelines function correctly.",
      "dimension": "Timeliness",
      "finding_ids": [
        "F5"
      ],
      "severity": "high",
      "expected_gain": 0.0228
    },
    {
      "action": "Populate customer_id for the 377 rows missing this identifier, sourcing from the customer master table.",
      "priority": 2,
      "description": "Completing 30.2% of customer_id gaps aligns with BCBS 239 Principle 4, enabling reliable risk data aggregation.",
      "dimension": "Completeness",
      "finding_ids": [
        "F6"
      ],
      "severity": "high",
      "expected_gain": 0.0055
    },
    {
      "action": "Ensure email is populated for the 368 rows lacking this field, using verified contact information.",
      "priority": 2,
      "description": "Filling 29.4% of missing emails supports GDPR Art. 5(1)(d) and DPDP Act 2023 data accuracy requirements.",
      "dimension": "Completeness",
      "finding_ids": [
        "F7"
      ],
      "severity": "high",
      "expected_gain": 0.0054
    },
    {
      "action": "Populate amount for the 367 rows missing this value, verifying transaction amounts from source systems.",
      "priority": 2,
      "description": "Completing 29.4% of amount gaps ensures accurate settlement calculations and risk assessments.",
      "dimension": "Completeness",
      "finding_ids": [
        "F8"
      ],
      "severity": "high",
      "expected_gain": 0.0053
    },
    {
      "action": "Standardize pan_number to the dominant length and uppercase case for the 273 inconsistent entries.",
      "priority": 2,
      "description": "Aligning 21.8% of pan_number values improves consistency, reducing duplicate detection errors.",
      "dimension": "Consistency",
      "finding_ids": [
        "F9"
      ],
      "severity": "high",
      "expected_gain": 0.0033
    },
    {
      "action": "Normalize currency codes to the dominant case and trim whitespace for the 263 inconsistent entries.",
      "priority": 2,
      "description": "Standardizing 21.0% of currency values prevents misclassification in analytics and reporting.",
      "dimension": "Consistency",
      "finding_ids": [
        "F10"
      ],
      "severity": "high",
      "expected_gain": 0.0031
    },
    {
      "action": "Validate and correct the 143 amount entries that are non‑numeric or negative, ensuring all amounts are numeric and non‑negative.",
      "priority": 3,
      "description": "Fixing 16.2% of amount validity violations guarantees accurate financial calculations and fraud model inputs.",
      "dimension": "Validity",
      "finding_ids": [
        "F11"
      ],
      "severity": "medium",
      "expected_gain": 0.0036
    }
  ],
  "regulatory_compliance_risks": [
    "Income Tax Act, 1961 s.139A (PAN); RBI KYC Master Direction: pan_number — 273 of 1,250 values (21.8%) fail validity checks.",
    "RBI KYC Master Direction: kyc_address — 411 of 1,250 values (32.9%) fail completeness checks.",
    "DPDP Act 2023: txn_timestamp — 285 of 1,250 values (22.8%) fail timeliness checks.",
    "Risk-data completeness (BCBS 239 Principle 4): customer_id — 377 of 1,250 values (30.2%) fail completeness checks.",
    "Personal-data accuracy principle (GDPR Art. 5(1)(d); India DPDP Act 2023 s.8(3)): email — 368 of 1,250 values (29.4%) fail completeness checks.",
    "Risk-data completeness (BCBS 239 Principle 4): amount — 367 of 1,250 values (29.4%) fail completeness checks.",
    "F1: Income Tax Act, 1961 s.139A (PAN); RBI KYC Master Direction",
    "F2: RBI KYC Master Direction",
    "F5: DPDP Act 2023"
  ],
  "executive_summary": "The composite data quality score of 0.9083 (Grade B) indicates that the payment dataset is generally usable for settlement and fraud modeling, but significant gaps exist that could jeopardize regulatory reporting. The most critical issues are missing KYC addresses (32.9% of rows), duplicate transaction identifiers (20.0% of rows), and future‑dated timestamps (22.8% of rows). Addressing these problems should be the first priority to ensure compliance and reliable analytics.",
  "narrative_source": "llm",
  "narrative_model": "groq/openai/gpt-oss-20b",
  "grounding": {
    "numeric_claims": 54,
    "verified": 54,
    "unverified_claims": [],
    "rounded_claims": [],
    "score": 1
  },
  "rules": {
    "jurisdiction": "IN",
    "rule_mode": "hybrid",
    "optional_columns": [],
    "applied_by_source": {
      "builtin": 20,
      "llm": 10
    },
    "rejected": [],
    "applied": [
      {
        "id": "B:Completeness:not_null:transaction_id",
        "source": "builtin",
        "dimension": "Completeness",
        "type": "not_null",
        "column": "transaction_id",
        "description": "transaction_id must be populated",
        "regulation": null,
        "checked": 1250,
        "violations": 0
      },
      {
        "id": "B:Integrity:not_null:transaction_id",
        "source": "builtin",
        "dimension": "Integrity",
        "type": "not_null",
        "column": "transaction_id",
        "description": "key column transaction_id must never be empty",
        "regulation": null,
        "checked": 1250,
        "violations": 0
      },
      {
        "id": "B:Completeness:not_null:customer_id",
        "source": "builtin",
        "dimension": "Completeness",
        "type": "not_null",
        "column": "customer_id",
        "description": "customer_id must be populated",
        "regulation": null,
        "checked": 1250,
        "violations": 377
      },
      {
        "id": "B:Completeness:not_null:amount",
        "source": "builtin",
        "dimension": "Completeness",
        "type": "not_null",
        "column": "amount",
        "description": "amount must be populated",
        "regulation": null,
        "checked": 1250,
        "violations": 367
      },
      {
        "id": "B:Validity:range:amount",
        "source": "builtin",
        "dimension": "Validity",
        "type": "range",
        "column": "amount",
        "description": "amount must be numeric and non-negative",
        "regulation": null,
        "checked": 883,
        "violations": 143
      },
      {
        "id": "B:Completeness:not_null:currency",
        "source": "builtin",
        "dimension": "Completeness",
        "type": "not_null",
        "column": "currency",
        "description": "currency must be populated",
        "regulation": null,
        "checked": 1250,
        "violations": 0
      },
      {
        "id": "B:Validity:allowed_values:currency",
        "source": "builtin",
        "dimension": "Validity",
        "type": "allowed_values",
        "column": "currency",
        "description": "currency must be an ISO 4217 currency code",
        "regulation": "ISO 4217",
        "checked": 1250,
        "violations": 0
      },
      {
        "id": "B:Completeness:not_null:txn_timestamp",
        "source": "builtin",
        "dimension": "Completeness",
        "type": "not_null",
        "column": "txn_timestamp",
        "description": "txn_timestamp must be populated",
        "regulation": null,
        "checked": 1250,
        "violations": 0
      },
      {
        "id": "B:Validity:date_parseable:txn_timestamp",
        "source": "builtin",
        "dimension": "Validity",
        "type": "date_parseable",
        "column": "txn_timestamp",
        "description": "txn_timestamp must be a parseable date/time",
        "regulation": null,
        "checked": 1250,
        "violations": 0
      },
      {
        "id": "B:Timeliness:date_not_future:txn_timestamp",
        "source": "builtin",
        "dimension": "Timeliness",
        "type": "date_not_future",
        "column": "txn_timestamp",
        "description": "txn_timestamp must not be in the future",
        "regulation": null,
        "checked": 1250,
        "violations": 130
      },
      {
        "id": "B:Timeliness:date_max_age:txn_timestamp",
        "source": "builtin",
        "dimension": "Timeliness",
        "type": "date_max_age",
        "column": "txn_timestamp",
        "description": "txn_timestamp must be within the 365-day freshness window",
        "regulation": null,
        "checked": 1250,
        "violations": 155
      },
      {
        "id": "B:Completeness:not_null:merchant_name",
        "source": "builtin",
        "dimension": "Completeness",
        "type": "not_null",
        "column": "merchant_name",
        "description": "merchant_name must be populated",
        "regulation": null,
        "checked": 1250,
        "violations": 0
      },
      {
        "id": "B:Completeness:not_null:payment_method",
        "source": "builtin",
        "dimension": "Completeness",
        "type": "not_null",
        "column": "payment_method",
        "description": "payment_method must be populated",
        "regulation": null,
        "checked": 1250,
        "violations": 0
      },
      {
        "id": "B:Completeness:not_null:status",
        "source": "builtin",
        "dimension": "Completeness",
        "type": "not_null",
        "column": "status",
        "description": "status must be populated",
        "regulation": null,
        "checked": 1250,
        "violations": 0
      },
      {
        "id": "B:Completeness:not_null:pan_number",
        "source": "builtin",
        "dimension": "Completeness",
        "type": "not_null",
        "column": "pan_number",
        "description": "pan_number must be populated",
        "regulation": null,
        "checked": 1250,
        "violations": 0
      },
      {
        "id": "B:Validity:regex:pan_number",
        "source": "builtin",
        "dimension": "Validity",
        "type": "regex",
        "column": "pan_number",
        "description": "pan_number must match the Indian PAN format AAAAA9999A",
        "regulation": "Income Tax Act, 1961 s.139A (PAN)",
        "checked": 1250,
        "violations": 273
      },
      {
        "id": "B:Completeness:not_null:email",
        "source": "builtin",
        "dimension": "Completeness",
        "type": "not_null",
        "column": "email",
        "description": "email must be populated",
        "regulation": null,
        "checked": 1250,
        "violations": 368
      },
      {
        "id": "B:Validity:regex:email",
        "source": "builtin",
        "dimension": "Validity",
        "type": "regex",
        "column": "email",
        "description": "email must be a well-formed email address",
        "regulation": null,
        "checked": 882,
        "violations": 0
      },
      {
        "id": "B:Completeness:not_null:kyc_address",
        "source": "builtin",
        "dimension": "Completeness",
        "type": "not_null",
        "column": "kyc_address",
        "description": "kyc_address must be populated",
        "regulation": null,
        "checked": 1250,
        "violations": 411
      },
      {
        "id": "B:Integrity:conditional_required:currency",
        "source": "builtin",
        "dimension": "Integrity",
        "type": "conditional_required",
        "column": "currency",
        "description": "every amount must carry a currency",
        "regulation": null,
        "checked": 883,
        "violations": 0
      },
      {
        "id": "L:Uniqueness:unique:transaction_id:0",
        "source": "llm",
        "dimension": "Uniqueness",
        "type": "unique",
        "column": "transaction_id",
        "description": "Each transaction must have a distinct identifier",
        "regulation": null,
        "checked": 1250,
        "violations": 250
      },
      {
        "id": "L:Completeness:not_null:transaction_id:1",
        "source": "llm",
        "dimension": "Completeness",
        "type": "not_null",
        "column": "transaction_id",
        "description": "Transaction ID must always be present",
        "regulation": null,
        "checked": 1250,
        "violations": 0
      },
      {
        "id": "L:Completeness:not_null:customer_id:2",
        "source": "llm",
        "dimension": "Completeness",
        "type": "not_null",
        "column": "customer_id",
        "description": "Customer identifier must be present for every transaction",
        "regulation": null,
        "checked": 1250,
        "violations": 377
      },
      {
        "id": "L:Validity:regex:pan_number:3",
        "source": "llm",
        "dimension": "Validity",
        "type": "regex",
        "column": "pan_number",
        "description": "PAN must match the Indian format: five letters, four digits, one letter",
        "regulation": "RBI KYC Master Direction",
        "checked": 1250,
        "violations": 273
      },
      {
        "id": "L:Validity:regex:email:4",
        "source": "llm",
        "dimension": "Validity",
        "type": "regex",
        "column": "email",
        "description": "Email addresses must follow standard email format",
        "regulation": "DPDP Act 2023",
        "checked": 882,
        "violations": 0
      },
      {
        "id": "L:Completeness:not_null:kyc_address:5",
        "source": "llm",
        "dimension": "Completeness",
        "type": "not_null",
        "column": "kyc_address",
        "description": "KYC address must be provided for every customer",
        "regulation": "RBI KYC Master Direction",
        "checked": 1250,
        "violations": 411
      },
      {
        "id": "L:Validity:allowed_values:payment_method:6",
        "source": "llm",
        "dimension": "Validity",
        "type": "allowed_values",
        "column": "payment_method",
        "description": "Payment method must be one of the predefined categories",
        "regulation": "DPDP Act 2023",
        "checked": 1250,
        "violations": 0
      },
      {
        "id": "L:Validity:allowed_values:currency:7",
        "source": "llm",
        "dimension": "Validity",
        "type": "allowed_values",
        "column": "currency",
        "description": "Currency code must be a valid ISO 4217 code",
        "regulation": "DPDP Act 2023",
        "checked": 1250,
        "violations": 0
      },
      {
        "id": "L:Validity:allowed_values:status:8",
        "source": "llm",
        "dimension": "Validity",
        "type": "allowed_values",
        "column": "status",
        "description": "Transaction status must be one of SUCCESS, FAILED, or PENDING",
        "regulation": "DPDP Act 2023",
        "checked": 1250,
        "violations": 0
      },
      {
        "id": "L:Timeliness:date_not_future:txn_timestamp:9",
        "source": "llm",
        "dimension": "Timeliness",
        "type": "date_not_future",
        "column": "txn_timestamp",
        "description": "Transaction timestamp cannot be in the future",
        "regulation": "DPDP Act 2023",
        "checked": 1250,
        "violations": 130
      }
    ],
    "derivation": {
      "requested_mode": "hybrid",
      "status": "ok",
      "model": "groq/openai/gpt-oss-20b",
      "local_model": false,
      "latency_ms": 4014.7,
      "proposed": 10,
      "accepted_by_deriver": 10,
      "citation_stats": {
        "cited": 0,
        "valid": 0,
        "fabricated": [],
        "precision": null,
        "rules_with_citation": 0
      },
      "policy_context": {
        "retrieval": "lexical",
        "clauses": [
          "RBI_INFOSEC:Section 4",
          "RBI_INFOSEC:Section 1",
          "RBI_INFOSEC:Section 3"
        ]
      },
      "error": null
    }
  },
  "governance": {
    "extractor_version": "3.0.0",
    "raw_values_included": false,
    "value_level_fields": [
      "categorical_stats.top_values (non-sensitive columns with <= 20 distinct values)",
      "numeric_stats min/max/mean (non-sensitive columns)",
      "temporal_stats min/max timestamps",
      "columns[].shape_signatures (format masks such as AAAAA9999A; no characters of the value)"
    ],
    "suppressed_fields": [
      "transaction_id: top values",
      "customer_id: top values",
      "txn_timestamp: top values",
      "pan_number: top values",
      "email: top values",
      "kyc_address: top values"
    ],
    "rows_profiled": 1250,
    "row_limit": null,
    "possibly_truncated": false,
    "processing": "in-memory in the data-plane; rows discarded when the job finishes",
    "scoring": "deterministic engine v1.0.0; no LLM involved in scores",
    "llm_provider": "groq/openai/gpt-oss-20b",
    "llm_local": false,
    "llm_input": "engine report summary (scores, rule descriptions, counts); no data values",
    "llm_input_redactions": {},
    "narrative_latency_ms": 4125.9,
    "llm_unknown_finding_ids": []
  },
  "metadata_fingerprint": "d9b9bbeb75b0128a12a0725b9448e4030e1cb2ea978abe0c42037cbad31eebe1",
  "audit_id": "d145e1a8-52d2-414e-8cf3-82e820e54f95",
  "dataset": {
    "dataset_id": "315b394b-fc2d-47e3-b541-636011e4f6ac",
    "dataset_name": "payment_data_high.csv",
    "row_count": 1250,
    "column_count": 11,
    "detected_domain": "Payments",
    "source_type": "csv",
    "ingestion_timestamp": "2026-09-28T07:52:28.526Z"
  }
};
