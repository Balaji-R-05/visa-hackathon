import crypto from "crypto";

/*
 * Privacy-preserving profiler.
 *
 * Raw rows enter this module and never leave it: everything returned is an
 * aggregate (counts, ratios, check results). The only value-level fields are
 * top values of low-cardinality, non-sensitive categorical columns and
 * min/max/mean of non-sensitive numeric/temporal columns and format masks
 * ("AAAAA9999A") of column values — listed explicitly
 * in the `governance` block so the claim is auditable.
 */

import {
  ISO_4217, isMissing, isNumericValue, isLikelyDate, stripSeparators, isValidCardNumber,
  EMAIL_RE, TAX_PAN_RE, CARD_DIGITS_RE, PHONE_RE, shapeOf,
} from "./patterns.js";
import { builtinRules, executeRules } from "./ruleEngine.js";

export const EXTRACTOR_VERSION = "3.0.0";

const LOW_CARDINALITY_MAX = 50;       // columns at or below this get case-variant checks
const TOP_VALUES_MAX_DISTINCT = 20;   // top values are only disclosed below this cardinality
const SEMANTIC_MAJORITY = 0.6;        // share of values that must match a pattern to type a column
const DETECTION_SAMPLE = 5000;
const FRESHNESS_WINDOW_DAYS = Number(process.env.DQ_FRESHNESS_WINDOW_DAYS || 365);
const DAY_MS = 24 * 60 * 60 * 1000;
const CVV_RE = /^[0-9]{3,4}$/;

const NAME_HINTS = {
  cvv: /(^|_)(cvv2?|cvc2?|cid|card_?security_?code|card_?verification)($|_)/i,
  email: /e-?mail/i,
  phone: /(phone|mobile|msisdn|contact_?no)/i,
  cardPan: /(card_?(no|num|number)|cc_?num|primary_?account|(^|_)pan($|_))/i,
  currency: /(currency|(^|_)ccy($|_)|curr_?code)/i,
  monetary: /(amount|(^|_)amt($|_)|price|fee|total|balance|cost|charge)/i,
  timestamp: /(date|time|(^|_)ts$|_at$|timestamp|(^|_)dt$)/i,
  nonEventTime: /(birth|dob|expir|valid_?(to|until)|maturity)/i,
  key: /^(id|uuid|guid)$|^(txn|transaction|payment|order|record|event)_?(id|ref|no|number|uuid)$/i,
  identifier: /(^id$|_id$|_key$|_ref$|uuid|guid)/i,
  kyc: /(kyc|address|addr|(^|_)dob($|_)|date_of_birth|national_?id|aadhaar|ssn|passport|id_?proof|tax_?id|pan_?(no|num|number)?$)/i,
  personal: /(name|e-?mail|phone|mobile|(^|_)dob($|_)|birth|address|ssn|aadhaar|passport)/i,
  notPersonal: /(merchant|product|bank|company|file|dataset|table|column|brand|method|status)/i,
  pci: /(card|cvv|cvc|(^|_)pan($|_)|expir|track)/i,
};

// Flatten driver-specific values (pg Date, Mongo ObjectId/Decimal128, nested docs) into primitives.
export const normalizeValue = (v) => {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString();
  if (typeof v === "string" || typeof v === "number") return v;
  if (typeof v === "boolean" || typeof v === "bigint") return String(v);
  if (Buffer.isBuffer(v)) return "[binary]";
  if (typeof v.toHexString === "function") return v.toHexString();
  if (v?._bsontype === "Decimal128") return v.toString();
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

const toColumns = (rows) => {
  const names = [];
  const seen = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row || {})) {
      if (!seen.has(key)) {
        seen.add(key);
        names.push(key);
      }
    }
  }
  const columns = {};
  for (const name of names) {
    columns[name] = rows.map((r) => normalizeValue(r?.[name]));
  }
  return { names, columns };
};

// Function to infer the type of data in a column.
export const inferType = (values) => {
  if (!values.length) return "empty";
  if (values.every((v) => isNumericValue(v))) return "numeric";
  if (values.every((v) => isLikelyDate(v))) return "datetime";
  return "string";
};

// Semantic-type detectors (the matching enforcement rules live in ruleEngine.js).
const RULES = {
  email: {
    description: "RFC-5322-style address (local@domain.tld)",
    test: (v) => EMAIL_RE.test(String(v).trim()),
  },
  card_pan: {
    description: "13-19 digit card number passing the Luhn checksum",
    test: isValidCardNumber,
  },
  tax_id_pan: {
    description: "Indian PAN format AAAAA9999A",
    test: (v) => TAX_PAN_RE.test(String(v).trim()),
  },
  currency_code: {
    description: "ISO 4217 currency code",
    test: (v) => ISO_4217.has(String(v).trim().toUpperCase()),
  },
  phone: {
    description: "7-15 digit phone number, optional leading +",
    test: (v) => PHONE_RE.test(stripSeparators(v)),
  },
  timestamp: {
    description: "parseable date/time",
    test: (v) => !isNaN(Date.parse(String(v))),
  },
  monetary_amount: {
    description: "numeric and non-negative (configure for refund/reversal ledgers)",
    test: (v) => isNumericValue(v) && Number(v) >= 0,
  },
  card_security_code: {
    description: "3-4 digit card verification code",
    test: (v) => CVV_RE.test(String(v).trim()),
  },
};

const share = (values, pred) => (values.length ? values.filter(pred).length / values.length : 0);

export const detectSemanticType = (name, values, inferred, distinctCount) => {
  const sample = values.slice(0, DETECTION_SAMPLE);
  if (!sample.length) return "empty";
  if (NAME_HINTS.cvv.test(name)) return "card_security_code";
  if (NAME_HINTS.email.test(name) || share(sample, RULES.email.test) >= SEMANTIC_MAJORITY) return "email";
  if (share(sample, RULES.card_pan.test) >= SEMANTIC_MAJORITY) return "card_pan";
  if (NAME_HINTS.cardPan.test(name) && share(sample, (v) => CARD_DIGITS_RE.test(stripSeparators(v))) >= SEMANTIC_MAJORITY) {
    return "card_pan";
  }
  if (share(sample, (v) => TAX_PAN_RE.test(String(v).trim().toUpperCase())) >= SEMANTIC_MAJORITY) return "tax_id_pan";
  if (
    NAME_HINTS.currency.test(name) ||
    (distinctCount <= 200 && share(sample, RULES.currency_code.test) >= 0.8)
  ) {
    return "currency_code";
  }
  if (NAME_HINTS.phone.test(name) && share(sample, RULES.phone.test) >= SEMANTIC_MAJORITY) return "phone";
  if (
    inferred === "datetime" ||
    (NAME_HINTS.timestamp.test(name) && share(sample, (v) => typeof v === "string" && isLikelyDate(v)) >= SEMANTIC_MAJORITY)
  ) {
    return "timestamp";
  }
  if (NAME_HINTS.monetary.test(name) && share(sample, isNumericValue) >= SEMANTIC_MAJORITY) return "monetary_amount";
  if (NAME_HINTS.identifier.test(name) || NAME_HINTS.key.test(name)) return "identifier";
  if (inferred === "numeric") return "numeric";
  if (distinctCount <= LOW_CARDINALITY_MAX) return "categorical";
  const avgLen = sample.reduce((a, v) => a + String(v).length, 0) / sample.length;
  if (share(sample, (v) => /\s/.test(String(v))) >= 0.5 && avgLen > 12) return "free_text";
  return "string";
};

export const detectSensitivity = (name, semantic) => {
  const tags = new Set();
  if (
    ["card_pan", "card_security_code"].includes(semantic) ||
    (NAME_HINTS.pci.test(name) && !["categorical", "tax_id_pan"].includes(semantic))
  ) {
    tags.add("pci");
  }
  if (semantic === "tax_id_pan" || NAME_HINTS.kyc.test(name)) tags.add("kyc");
  if (
    ["email", "phone"].includes(semantic) ||
    (NAME_HINTS.personal.test(name) && !NAME_HINTS.notPersonal.test(name))
  ) {
    tags.add("pii");
  }
  return [...tags];
};

// Function to extract dataset metadata.
export const extractDatasetMetadata = (rows, sourceName, domain = "Unknown", sourceType = "unknown", columnCount) => ({
  dataset_id: crypto.randomUUID(),
  dataset_name: sourceName,
  row_count: rows.length,
  column_count: columnCount ?? (rows.length ? Object.keys(rows[0]).length : 0),
  detected_domain: domain,
  source_type: sourceType,
  ingestion_timestamp: new Date().toISOString(),
});

const profileColumn = (name, rawValues, rowCount) => {
  const nonNull = rawValues.filter((v) => !isMissing(v));
  const distinct = new Set(nonNull.map((v) => String(v)));
  const inferred = inferType(nonNull);
  const semantic = detectSemanticType(name, nonNull, inferred, distinct.size);
  const sensitivity = detectSensitivity(name, semantic);
  return { name, nonNull, distinct, inferred, semantic, sensitivity, nullCount: rowCount - nonNull.length };
};

const numericSummary = (nums) => {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let negatives = 0;
  for (const v of nums) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    if (v < 0) negatives++;
  }
  return { min_value: min, max_value: max, mean: sum / nums.length, negative_value_ratio: negatives / nums.length };
};

const quantile = (sorted, q) => {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

const caseOf = (v) => {
  const letters = String(v).replace(/[^a-zA-Z]/g, "");
  if (!letters) return "n/a";
  if (letters === letters.toUpperCase()) return "upper";
  if (letters === letters.toLowerCase()) return "lower";
  return "mixed";
};

const dominantShare = (counts, total) => {
  let bestKey = null;
  let best = 0;
  for (const [k, c] of Object.entries(counts)) {
    if (c > best) {
      best = c;
      bestKey = k;
    }
  }
  return { key: bestKey, ratio: total ? best / total : 1 };
};

const countBy = (values, fn) => {
  const counts = {};
  for (const v of values) {
    const k = fn(v);
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
};

// Representation-consistency check. Low-cardinality columns: values that are a
// non-dominant spelling (case/whitespace) of the same code. High-cardinality
// fixed-format columns: values breaking the dominant length/case pattern.
const consistencyCheck = (col) => {
  const { nonNull, distinct, semantic } = col;
  if (!nonNull.length) return null;
  if (["numeric", "monetary_amount", "timestamp", "free_text", "email", "empty"].includes(semantic)) return null;
  if (col.inferred === "numeric" && semantic !== "card_pan" && semantic !== "identifier") return null;

  const strings = nonNull.map((v) => String(v));
  const caseCounts = countBy(strings, caseOf);
  const lengthCounts = countBy(strings, (v) => v.length);
  const domCase = dominantShare(caseCounts, strings.length);
  const domLength = dominantShare(lengthCounts, strings.length);
  const base = {
    dominant_case_ratio: domCase.ratio,
    dominant_length_ratio: domLength.ratio,
  };

  const foldedDistinct = new Set(strings.map((v) => v.trim().toLowerCase())).size;
  if (foldedDistinct <= LOW_CARDINALITY_MAX) {
    const groups = {};
    for (const v of strings) {
      const key = v.trim().toLowerCase();
      groups[key] ??= {};
      groups[key][v] = (groups[key][v] || 0) + 1;
    }
    let violations = 0;
    for (const forms of Object.values(groups)) {
      const counts = Object.values(forms);
      violations += counts.reduce((a, b) => a + b, 0) - Math.max(...counts);
    }
    return {
      ...base,
      check: "case_variant",
      check_description: "values that are a non-dominant case/whitespace spelling of the same code",
      checked: strings.length,
      violations,
      violation_ratio: violations / strings.length,
    };
  }

  if (distinct.size > LOW_CARDINALITY_MAX && domLength.ratio >= 0.5) {
    const enforceCase = domCase.ratio >= 0.8 && domCase.key !== "n/a";
    const violations = strings.filter(
      (v) => String(v.length) !== domLength.key || (enforceCase && caseOf(v) !== domCase.key)
    ).length;
    return {
      ...base,
      check: "fixed_format",
      check_description: `values deviating from the dominant length (${domLength.key})${enforceCase ? ` or case (${domCase.key})` : ""}`,
      checked: strings.length,
      violations,
      violation_ratio: violations / strings.length,
    };
  }
  return null;
};

// Descriptive temporal profile. Enforcement (future dates, freshness) is done by rules.
const temporalProfile = (col, now, freshnessDays) => {
  if (col.semantic !== "timestamp") return null;
  const times = col.nonNull.map((v) => Date.parse(String(v))).filter((t) => !isNaN(t));
  if (!times.length) return null;
  let minT = Infinity;
  let maxT = -Infinity;
  let future = 0;
  let stale = 0;
  for (const t of times) {
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
    if (t > now + DAY_MS) future++;
    else if (freshnessDays > 0 && now - t > freshnessDays * DAY_MS) stale++;
  }
  return {
    min_timestamp: new Date(minT).toISOString(),
    max_timestamp: new Date(maxT).toISOString(),
    future_timestamp_ratio: future / times.length,
    stale_record_ratio: stale / times.length,
    freshness_window_days: freshnessDays,
    latest_record_age_days: Math.max(0, (now - maxT) / DAY_MS),
  };
};

const outlierCheck = (col) => {
  if (col.semantic !== "monetary_amount") return null;
  const nums = col.nonNull.filter(isNumericValue).map(Number).filter((v) => v >= 0).sort((a, b) => a - b);
  if (nums.length < 20) return null;
  const q1 = quantile(nums, 0.25);
  const q3 = quantile(nums, 0.75);
  const iqr = q3 - q1;
  const lower = q1 - 3 * iqr;
  const upper = q3 + 3 * iqr;
  const violations = nums.filter((v) => v < lower || v > upper).length;
  return {
    check: "iqr_outlier",
    check_description: "non-negative amounts beyond Q1/Q3 ± 3×IQR (plausibility proxy; no reference source available)",
    checked: nums.length,
    violations,
    violation_ratio: violations / nums.length,
  };
};

const shapeSignatures = (nonNull) => {
  const sample = nonNull.slice(0, 2000);
  if (!sample.length) return [];
  const counts = countBy(sample, (v) => shapeOf(v));
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([shape, n]) => ({ shape, share: n / sample.length }));
};

/*
 * Profiles rows into privacy-safe metadata. Also returns a `context` holding
 * the column-major raw values; the context must never leave the data-plane and
 * exists only so rules can be executed against the rows.
 */
export const profileDataset = (rows, sourceName, sourceType = "unknown", options = {}) => {
  const { names, columns } = toColumns(rows);
  const rowCount = rows.length;
  const now = options.now ?? Date.now();
  const freshnessDays = options.freshnessDays ?? FRESHNESS_WINDOW_DAYS;
  const profiles = names.map((n) => profileColumn(n, columns[n], rowCount));
  for (const p of profiles) {
    p.isKey =
      NAME_HINTS.key.test(p.name) ||
      (p.semantic === "identifier" && p.nonNull.length > 0 && p.distinct.size / p.nonNull.length >= 0.99);
  }

  const columnMeta = profiles.map((p) => ({
    column_name: p.name,
    inferred_data_type: p.inferred,
    semantic_type: p.semantic,
    sensitivity: p.sensitivity,
    is_key: p.isKey,
    null_count: p.nullCount,
    null_ratio: rowCount ? p.nullCount / rowCount : 0,
    unique_count: p.distinct.size,
    unique_ratio: rowCount ? p.distinct.size / rowCount : 0,
    shape_signatures: shapeSignatures(p.nonNull),
    sample_values_masked: p.nonNull.slice(0, 3).map(() => "***"),
  }));

  const numeric_stats = {};
  const categorical_stats = {};
  const temporal_stats = {};
  const format_stats = {};
  const accuracy_checks = {};
  const suppressed = [];

  for (const p of profiles) {
    const sensitive =
      p.sensitivity.length > 0 || ["identifier", "card_pan", "tax_id_pan", "card_security_code"].includes(p.semantic);

    if ((p.inferred === "numeric" || p.semantic === "monetary_amount") && p.nonNull.length) {
      if (sensitive) {
        suppressed.push(`${p.name}: numeric min/max/mean`);
      } else {
        const nums = p.nonNull.filter(isNumericValue).map(Number);
        if (nums.length) numeric_stats[p.name] = numericSummary(nums);
      }
    }

    if (p.inferred !== "numeric" && p.nonNull.length) {
      const disclose = !sensitive && p.distinct.size <= TOP_VALUES_MAX_DISTINCT;
      const freq = countBy(p.nonNull, (v) => String(v));
      const byFrequency = Object.entries(freq).sort((a, b) => b[1] - a[1]).map((e) => e[0]);
      categorical_stats[p.name] = {
        distinct_values: p.distinct.size,
        top_values: disclose ? byFrequency.slice(0, 3) : [],
        top_values_suppressed: !disclose,
        // Complete code list, so a rule deriver never mistakes the top 3 for the whole domain.
        values: disclose ? byFrequency : [],
      };
      if (!disclose) suppressed.push(`${p.name}: top values`);
    }

    const fmt = consistencyCheck(p);
    if (fmt) format_stats[p.name] = fmt;

    const tl = temporalProfile(p, now, freshnessDays);
    if (tl) temporal_stats[p.name] = tl;

    const acc = outlierCheck(p);
    if (acc) accuracy_checks[p.name] = acc;
  }

  // Uniqueness: exact duplicate rows plus duplicates within key columns.
  const seenRows = new Set();
  for (let i = 0; i < rowCount; i++) {
    seenRows.add(JSON.stringify(names.map((n) => (isMissing(columns[n][i]) ? null : String(columns[n][i])))));
  }
  const duplicateRows = rowCount - seenRows.size;
  const keyProfiles = profiles.filter((p) => p.isKey);
  const key_duplicate_ratio = Object.fromEntries(
    keyProfiles.map((p) => [p.name, p.nonNull.length ? (p.nonNull.length - p.distinct.size) / p.nonNull.length : 0])
  );

  const sensitive_columns = Object.fromEntries(profiles.filter((p) => p.sensitivity.length).map((p) => [p.name, p.sensitivity]));
  const prohibited_data = [];
  for (const p of profiles) {
    if (p.semantic === "card_security_code") {
      prohibited_data.push(`Column '${p.name}' appears to hold card verification codes; PCI DSS v4.0 Req. 3.3 forbids retaining sensitive authentication data after authorization.`);
    }
    if (p.semantic === "card_pan" && share(p.nonNull.slice(0, DETECTION_SAMPLE), isValidCardNumber) >= 0.5) {
      prohibited_data.push(`Column '${p.name}' appears to hold unmasked card numbers; PCI DSS v4.0 Req. 3.5.1 requires PAN to be unreadable wherever stored.`);
    }
  }

  const monetaryPresent = profiles.some((p) => p.semantic === "monetary_amount");
  const currencyPresent = profiles.some((p) => p.semantic === "currency_code");
  const compliance_flags = {
    kyc_fields_present: profiles.some((p) => p.sensitivity.includes("kyc")),
    monetary_fields_present: monetaryPresent,
    personal_data_present: profiles.some((p) => p.sensitivity.includes("pii")),
    pci_fields_present: profiles.some((p) => p.sensitivity.includes("pci")),
    sensitive_columns,
    prohibited_data,
  };
  const isPayments = monetaryPresent || currencyPresent || compliance_flags.pci_fields_present;

  const metadata = {
    dataset: extractDatasetMetadata(rows, sourceName, isPayments ? "Payments" : "Generic", sourceType, names.length),
    columns: columnMeta,
    numeric_stats,
    categorical_stats,
    temporal_stats,
    patterns: {},
    format_stats,
    accuracy_checks,
    cross_column_stats: {
      duplicates_detected: duplicateRows > 0,
      duplicate_row_count: duplicateRows,
      duplicate_row_ratio: rowCount ? duplicateRows / rowCount : 0,
      key_columns: keyProfiles.map((p) => p.name),
      key_duplicate_ratio,
      dependent_nulls: [],
    },
    compliance_flags,
    governance: {
      extractor_version: EXTRACTOR_VERSION,
      raw_values_included: false,
      value_level_fields: [
        `categorical_stats.top_values (non-sensitive columns with <= ${TOP_VALUES_MAX_DISTINCT} distinct values)`,
        "numeric_stats min/max/mean (non-sensitive columns)",
        "temporal_stats min/max timestamps",
        "columns[].shape_signatures (format masks such as AAAAA9999A; no characters of the value)",
      ],
      suppressed_fields: suppressed,
      rows_profiled: rowCount,
      row_limit: options.rowLimit ?? null,
      possibly_truncated: options.rowLimit != null && rowCount >= options.rowLimit,
      processing: "in-memory in the data-plane; rows discarded when the job finishes",
    },
  };

  return {
    metadata,
    context: {
      columns,
      rowCount,
      profiles: profiles.map((p) => ({ name: p.name, semantic: p.semantic, isKey: p.isKey })),
      now,
      freshnessDays,
    },
  };
};

/*
 * Executes built-in rules plus any externally derived (LLM) rules against the
 * rows held in `context` and attaches the result to the metadata.
 * ruleMode: "builtin" (library only) | "llm" (derived rules + not-null baseline) | "hybrid" (both).
 */
export const applyRules = (
  metadata,
  context,
  { jurisdiction = "GLOBAL", ruleMode = "builtin", derivedRules = [], optionalColumns = [] } = {}
) => {
  const freshnessDays = context.freshnessDays ?? FRESHNESS_WINDOW_DAYS;
  const builtin = builtinRules(context.profiles, { jurisdiction, freshnessDays, optionalColumns });
  let candidates;
  if (ruleMode === "builtin") candidates = builtin;
  else if (ruleMode === "llm") candidates = [...builtin.filter((r) => r.dimension === "Completeness"), ...derivedRules];
  else candidates = [...builtin, ...derivedRules];

  const rule_evaluation = executeRules(context.columns, context.rowCount, candidates, {
    now: context.now,
    jurisdiction,
    ruleMode,
    optionalColumns,
    freshnessDays,
    semantics: Object.fromEntries(context.profiles.map((p) => [p.name, p.semantic])),
  });
  return { ...metadata, rule_evaluation };
};

// Synchronous convenience path: profile + built-in rules in one call.
export const buildFullMetadata = (rows, sourceName, _domain = "Unknown", sourceType = "unknown", options = {}) => {
  const { metadata, context } = profileDataset(rows, sourceName, sourceType, options);
  return applyRules(metadata, context, options);
};
