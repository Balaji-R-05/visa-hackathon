import {
  EMAIL_RE, ISO_4217, isMissing, isNumericValue, isValidCardNumber,
} from "./patterns.js";

/*
 * Declarative data-quality rules.
 *
 * Rules come from two places — the built-in library below (keyed on semantic
 * column type and jurisdiction) and the LLM rule deriver in ai-services — but
 * both are plain JSON in the same small DSL, validated here and executed here,
 * next to the rows. An LLM therefore never judges data; it can only propose a
 * rule, and a rule that fails validation is rejected with a reason.
 */

export const DIMENSIONS = ["Completeness", "Validity", "Accuracy", "Consistency", "Uniqueness", "Timeliness", "Integrity"];

const COMPARE_OPS = ["<", "<=", ">", ">=", "==", "!="];
const MAX_PATTERN_LENGTH = 256;
const MAX_TEST_LENGTH = 512;
const DAY_MS = 24 * 60 * 60 * 1000;

// A quantified group that itself contains a quantifier, e.g. (a+)+ or (\w*)*:
// the classic catastrophic-backtracking shape. Rejected rather than executed.
const NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)\s*[+*{]/;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

const PARAM_VALIDATORS = {
  not_null: () => null,
  conditional_required: (p, cols) => {
    if (!cols.has(p.when_column)) return "when_column does not exist";
    return null;
  },
  regex: (p) => {
    if (typeof p.pattern !== "string" || !p.pattern) return "pattern is required";
    if (p.pattern.length > MAX_PATTERN_LENGTH) return "pattern too long";
    if (NESTED_QUANTIFIER.test(p.pattern)) return "pattern has nested quantifiers (backtracking risk)";
    if (p.flags && !["", "i"].includes(p.flags)) return "only the 'i' flag is allowed";
    try {
      new RegExp(p.pattern, p.flags || "");
    } catch (e) {
      return `invalid regex: ${e.message}`;
    }
    return null;
  },
  allowed_values: (p) => {
    if (!Array.isArray(p.values) || !p.values.length) return "values must be a non-empty list";
    if (p.values.length > 500) return "too many allowed values";
    return null;
  },
  range: (p) => {
    if (p.min == null && p.max == null) return "min or max is required";
    if ((p.min != null && !isNum(p.min)) || (p.max != null && !isNum(p.max))) return "min/max must be numbers";
    if (p.min != null && p.max != null && p.min > p.max) return "min > max";
    return null;
  },
  length: (p) => {
    if (p.min == null && p.max == null) return "min or max is required";
    if ((p.min != null && !Number.isInteger(p.min)) || (p.max != null && !Number.isInteger(p.max))) return "min/max must be integers";
    if (p.min != null && p.max != null && p.min > p.max) return "min > max";
    return null;
  },
  luhn: () => null,
  date_parseable: () => null,
  date_not_future: (p) => (p.tolerance_days != null && !isNum(p.tolerance_days) ? "tolerance_days must be a number" : null),
  date_max_age: (p) => (!isNum(p.max_age_days) || p.max_age_days <= 0 ? "max_age_days must be a positive number" : null),
  column_compare: (p, cols) => {
    if (!COMPARE_OPS.includes(p.op)) return `op must be one of ${COMPARE_OPS.join(" ")}`;
    if (!cols.has(p.other_column)) return "other_column does not exist";
    return null;
  },
  unique: () => null,
};

export const RULE_TYPES = Object.keys(PARAM_VALIDATORS);

// Column types whose values are codes, not quantities: a numeric `range` on them is a type error
// (e.g. "card number between 13 and 16" meant as a length, which fails every row).
const IDENTIFIER_TYPES = new Set(["identifier", "card_pan", "tax_id_pan", "phone", "card_security_code", "email"]);
const DATE_AGE_TYPES = new Set(["date_not_future", "date_max_age"]);
const NON_EVENT_DATE = /(birth|dob|expir|valid_?(to|until)|maturity)/i;

// Checks that need the column's profile, not just the rule's shape.
const semanticError = (rule, semantic) => {
  if (rule.type === "range" && IDENTIFIER_TYPES.has(semantic)) {
    return `range compares numeric magnitudes; '${rule.column}' is ${semantic} (use length or regex)`;
  }
  if (DATE_AGE_TYPES.has(rule.type) && rule.dimension === "Timeliness" && NON_EVENT_DATE.test(rule.column)) {
    return `'${rule.column}' is not an event timestamp, so its age does not measure timeliness`;
  }
  return null;
};

// Returns { ok: true, rule } with defaults applied, or { ok: false, reason }.
// `semantics` (column -> semantic type) enables type-aware checks when available.
export const validateRule = (rule, columnNames, semantics = {}) => {
  const cols = columnNames instanceof Set ? columnNames : new Set(columnNames);
  if (!rule || typeof rule !== "object") return { ok: false, reason: "rule is not an object" };
  if (!RULE_TYPES.includes(rule.type)) return { ok: false, reason: `unknown rule type '${rule.type}'` };
  if (!DIMENSIONS.includes(rule.dimension)) return { ok: false, reason: `unknown dimension '${rule.dimension}'` };
  if (!cols.has(rule.column)) return { ok: false, reason: `column '${rule.column}' does not exist` };
  const params = rule.params && typeof rule.params === "object" ? rule.params : {};
  const err = PARAM_VALIDATORS[rule.type](params, cols) || semanticError(rule, semantics[rule.column]);
  if (err) return { ok: false, reason: err };
  return {
    ok: true,
    rule: {
      id: String(rule.id || `${rule.type}:${rule.column}`),
      source: rule.source || "builtin",
      dimension: rule.dimension,
      type: rule.type,
      column: rule.column,
      params,
      description: rule.description || "",
      rationale: rule.rationale || "",
      regulation: rule.regulation || null,
      citations: Array.isArray(rule.citations) ? rule.citations.map(String) : [],
      approved: rule.approved === true,
    },
  };
};

const compareValues = (a, b, op) => {
  let x;
  let y;
  if (isNumericValue(a) && isNumericValue(b)) {
    x = Number(a);
    y = Number(b);
  } else {
    x = Date.parse(String(a));
    y = Date.parse(String(b));
    if (isNaN(x) || isNaN(y)) return null;
  }
  switch (op) {
    case "<": return x < y;
    case "<=": return x <= y;
    case ">": return x > y;
    case ">=": return x >= y;
    case "==": return x === y;
    case "!=": return x !== y;
    default: return null;
  }
};

// Builds a per-row evaluator returning "skip" | "pass" | "fail".
const compileRule = (rule, columns, now) => {
  const values = columns[rule.column];
  const p = rule.params;
  const present = (i) => !isMissing(values[i]);
  const onPresent = (test) => (i) => (present(i) ? (test(values[i]) ? "pass" : "fail") : "skip");

  switch (rule.type) {
    case "not_null":
      return (i) => (present(i) ? "pass" : "fail");
    case "conditional_required": {
      const when = columns[p.when_column];
      const matches = (i) => !isMissing(when[i]) && (p.when_equals == null || String(when[i]) === String(p.when_equals));
      return (i) => (matches(i) ? (present(i) ? "pass" : "fail") : "skip");
    }
    case "regex": {
      const re = new RegExp(p.pattern, p.flags || "");
      return onPresent((v) => re.test(String(v).slice(0, MAX_TEST_LENGTH)));
    }
    case "allowed_values": {
      const cs = p.case_sensitive !== false;
      const allowed = new Set(p.values.map((v) => (cs ? String(v) : String(v).toLowerCase())));
      return onPresent((v) => allowed.has(cs ? String(v).trim() : String(v).trim().toLowerCase()));
    }
    case "range":
      return onPresent((v) => isNumericValue(v) && (p.min == null || Number(v) >= p.min) && (p.max == null || Number(v) <= p.max));
    case "length":
      return onPresent((v) => {
        const n = String(v).length;
        return (p.min == null || n >= p.min) && (p.max == null || n <= p.max);
      });
    case "luhn":
      return onPresent(isValidCardNumber);
    case "date_parseable":
      return onPresent((v) => !isNaN(Date.parse(String(v))));
    case "date_not_future": {
      const tol = (p.tolerance_days ?? 1) * DAY_MS;
      return (i) => {
        if (!present(i)) return "skip";
        const t = Date.parse(String(values[i]));
        if (isNaN(t)) return "skip";
        return t <= now + tol ? "pass" : "fail";
      };
    }
    case "date_max_age": {
      const maxAge = p.max_age_days * DAY_MS;
      return (i) => {
        if (!present(i)) return "skip";
        const t = Date.parse(String(values[i]));
        if (isNaN(t)) return "skip";
        return now - t <= maxAge ? "pass" : "fail";
      };
    }
    case "column_compare": {
      const other = columns[p.other_column];
      return (i) => {
        if (!present(i) || isMissing(other[i])) return "skip";
        const r = compareValues(values[i], other[i], p.op);
        return r === null ? "skip" : r ? "pass" : "fail";
      };
    }
    case "unique": {
      const seen = new Set();
      return (i) => {
        if (!present(i)) return "skip";
        const k = String(values[i]);
        if (seen.has(k)) return "fail";
        seen.add(k);
        return "pass";
      };
    }
    default:
      throw new Error(`no executor for rule type ${rule.type}`);
  }
};

// An unreviewed LLM rule that fails more than this share of the values it checks is more likely
// wrong than the data (a mis-typed rule fails every row), so it is held for review, not scored.
export const SUSPECT_RATIO = Number(process.env.DQ_RULE_SUSPECT_RATIO || 0.5);
const SUSPECT_MIN_CHECKED = 20;

/*
 * Executes validated rules in two passes. Each rule is first evaluated on its
 * own; unreviewed LLM rules that look implausible are held for review. The
 * remaining rules sharing a (dimension, column) are then combined with union
 * semantics (a value violating any rule counts once), so adding a redundant
 * rule never double-penalizes a column.
 */
export const executeRules = (columns, rowCount, candidateRules, {
  now = Date.now(), jurisdiction = "GLOBAL", ruleMode = "builtin", optionalColumns = [],
  semantics = {}, suspectRatio = SUSPECT_RATIO, freshnessDays = null,
} = {}) => {
  const names = Object.keys(columns);
  const valid = [];
  const rejected = [];
  const seenIds = new Set();

  for (const candidate of candidateRules) {
    const res = validateRule(candidate, names, semantics);
    if (!res.ok) {
      rejected.push({ rule: candidate, reason: res.reason });
      continue;
    }
    let { rule } = res;
    if (seenIds.has(rule.id)) rule = { ...rule, id: `${rule.id}#${seenIds.size}` };
    seenIds.add(rule.id);
    valid.push(rule);
  }

  const unions = new Map();
  const results = [];
  for (const rule of valid) {
    const evalRow = compileRule(rule, columns, now);
    const status = new Uint8Array(rowCount); // 0 skip, 1 pass, 2 fail
    let checked = 0;
    let violations = 0;
    for (let i = 0; i < rowCount; i++) {
      const s = evalRow(i);
      if (s === "skip") continue;
      checked++;
      if (s === "fail") {
        violations++;
        status[i] = 2;
      } else {
        status[i] = 1;
      }
    }
    const violation_ratio = checked ? violations / checked : 0;
    const counts = { checked, violations, violation_ratio };

    if (rule.source === "llm" && !rule.approved && checked >= SUSPECT_MIN_CHECKED && violation_ratio > suspectRatio) {
      results.push({
        ...rule, ...counts, status: "held",
        hold_reason: `fails ${(violation_ratio * 100).toFixed(1)}% of checked values (limit ${(suspectRatio * 100).toFixed(0)}%); review before enforcing`,
      });
      continue;
    }

    const key = `${rule.dimension}::${rule.column}`;
    if (!unions.has(key)) {
      unions.set(key, {
        dimension: rule.dimension,
        column: rule.column,
        rule_ids: [],
        checkedMask: new Uint8Array(rowCount),
        failMask: new Uint8Array(rowCount),
      });
    }
    const u = unions.get(key);
    u.rule_ids.push(rule.id);
    for (let i = 0; i < rowCount; i++) {
      if (status[i]) u.checkedMask[i] = 1;
      if (status[i] === 2) u.failMask[i] = 1;
    }
    results.push({ ...rule, ...counts, status: "applied" });
  }

  const column_checks = [...unions.values()].map((u) => {
    let checked = 0;
    let violations = 0;
    for (let i = 0; i < rowCount; i++) {
      checked += u.checkedMask[i];
      violations += u.failMask[i];
    }
    return {
      dimension: u.dimension,
      column: u.column,
      rule_ids: u.rule_ids,
      checked,
      violations,
      violation_ratio: checked ? violations / checked : 0,
    };
  });

  return {
    jurisdiction,
    rule_mode: ruleMode,
    optional_columns: optionalColumns,
    freshness_days: freshnessDays,
    suspect_ratio: suspectRatio,
    rules: results,
    rejected,
    column_checks,
  };
};

/* ---------------------------------------------------------------
   Built-in rule library
---------------------------------------------------------------- */

const SEMANTIC_RULES = {
  email: (c) => [{ dimension: "Validity", type: "regex", params: { pattern: EMAIL_RE.source }, description: `${c} must be a well-formed email address` }],
  card_pan: (c) => [{ dimension: "Validity", type: "luhn", description: `${c} must be a 13-19 digit card number passing the Luhn checksum`, regulation: "ISO/IEC 7812-1" }],
  tax_id_pan: (c) => [{ dimension: "Validity", type: "regex", params: { pattern: "^[A-Z]{5}[0-9]{4}[A-Z]$" }, description: `${c} must match the Indian PAN format AAAAA9999A`, regulation: "Income Tax Act, 1961 s.139A (PAN)" }],
  currency_code: (c) => [{ dimension: "Validity", type: "allowed_values", params: { values: [...ISO_4217], case_sensitive: false }, description: `${c} must be an ISO 4217 currency code`, regulation: "ISO 4217" }],
  phone: (c) => [{ dimension: "Validity", type: "regex", params: { pattern: "^\\+?[0-9\\s\\-()]{7,20}$" }, description: `${c} must be a 7-15 digit phone number` }],
  timestamp: (c) => [{ dimension: "Validity", type: "date_parseable", description: `${c} must be a parseable date/time` }],
  monetary_amount: (c) => [{ dimension: "Validity", type: "range", params: { min: 0 }, description: `${c} must be numeric and non-negative` }],
  card_security_code: (c) => [{ dimension: "Validity", type: "regex", params: { pattern: "^[0-9]{3,4}$" }, description: `${c} must be a 3-4 digit code` }],
};

// Name-triggered, jurisdiction-specific formats. Each entry: [name hint, rule factory].
const JURISDICTION_PACKS = {
  IN: [
    [/ifsc/i, (c) => ({ dimension: "Validity", type: "regex", params: { pattern: "^[A-Z]{4}0[A-Z0-9]{6}$" }, description: `${c} must be an 11-character IFSC code`, regulation: "RBI IFSC scheme" })],
    [/(upi|vpa)/i, (c) => ({ dimension: "Validity", type: "regex", params: { pattern: "^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$" }, description: `${c} must be a UPI virtual payment address`, regulation: "NPCI UPI specification" })],
    [/(pincode|pin_code|postal_?code|zip)/i, (c) => ({ dimension: "Validity", type: "regex", params: { pattern: "^[1-9][0-9]{5}$" }, description: `${c} must be a 6-digit Indian PIN code` })],
    [/aadhaar|aadhar|uid/i, (c) => ({ dimension: "Validity", type: "regex", params: { pattern: "^[Xx*]{8}[0-9]{4}$" }, description: `${c} must be stored masked (only the last 4 digits visible)`, regulation: "Aadhaar Act, 2016 and UIDAI data-storage guidance" })],
    [/gstin/i, (c) => ({ dimension: "Validity", type: "regex", params: { pattern: "^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$" }, description: `${c} must be a 15-character GSTIN`, regulation: "CGST Rules, 2017" })],
    [/(mobile|phone)/i, (c) => ({ dimension: "Validity", type: "regex", params: { pattern: "^(\\+91[\\s-]?)?[6-9][0-9]{9}$" }, description: `${c} must be an Indian mobile number` })],
  ],
  EU: [
    [/iban/i, (c) => ({ dimension: "Validity", type: "regex", params: { pattern: "^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$" }, description: `${c} must be an IBAN`, regulation: "ISO 13616" })],
    [/(bic|swift)/i, (c) => ({ dimension: "Validity", type: "regex", params: { pattern: "^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$" }, description: `${c} must be a BIC/SWIFT code`, regulation: "ISO 9362" })],
    [/country/i, (c) => ({ dimension: "Validity", type: "regex", params: { pattern: "^[A-Z]{2}$" }, description: `${c} must be an ISO 3166-1 alpha-2 code`, regulation: "ISO 3166-1" })],
  ],
  US: [
    [/(zip|postal_?code)/i, (c) => ({ dimension: "Validity", type: "regex", params: { pattern: "^[0-9]{5}(-[0-9]{4})?$" }, description: `${c} must be a ZIP or ZIP+4 code` })],
    [/ssn/i, (c) => ({ dimension: "Validity", type: "regex", params: { pattern: "^([*Xx]{3}-?[*Xx]{2}-?)[0-9]{4}$" }, description: `${c} must be stored masked (last 4 digits only)`, regulation: "GLBA Safeguards Rule (16 CFR 314)" })],
    [/(routing|aba)/i, (c) => ({ dimension: "Validity", type: "regex", params: { pattern: "^[0-9]{9}$" }, description: `${c} must be a 9-digit ABA routing number` })],
    [/(^|_)state($|_)/i, (c) => ({ dimension: "Validity", type: "regex", params: { pattern: "^[A-Z]{2}$" }, description: `${c} must be a 2-letter state code` })],
  ],
};

export const JURISDICTIONS = ["GLOBAL", "IN", "EU", "US"];

const EVENT_TIME_EXCLUDE = /(birth|dob|expir|valid_?(to|until)|maturity)/i;

/*
 * profiles: [{ name, semantic, isKey }]
 * Returns candidate rules (validated at execution time like any other).
 */
export const builtinRules = (profiles, { jurisdiction = "GLOBAL", freshnessDays = 365, optionalColumns = [] } = {}) => {
  const rules = [];
  const optional = new Set(optionalColumns);
  const add = (column, r) => rules.push({ source: "builtin", column, id: `B:${r.dimension}:${r.type}:${column}`, ...r });

  for (const p of profiles) {
    if (!optional.has(p.name)) {
      add(p.name, { dimension: "Completeness", type: "not_null", description: `${p.name} must be populated` });
    }
    for (const r of SEMANTIC_RULES[p.semantic]?.(p.name) || []) add(p.name, r);

    if (p.semantic === "timestamp" && !EVENT_TIME_EXCLUDE.test(p.name)) {
      add(p.name, { dimension: "Timeliness", type: "date_not_future", params: { tolerance_days: 1 }, description: `${p.name} must not be in the future` });
      if (freshnessDays > 0) {  // 0 disables the age check (archival datasets)
        add(p.name, { dimension: "Timeliness", type: "date_max_age", params: { max_age_days: freshnessDays }, description: `${p.name} must be within the ${freshnessDays}-day freshness window` });
      }
    }
    if (p.isKey) {
      add(p.name, { dimension: "Integrity", type: "not_null", description: `key column ${p.name} must never be empty` });
    }
    for (const [hint, factory] of JURISDICTION_PACKS[jurisdiction] || []) {
      if (hint.test(p.name)) add(p.name, { ...factory(p.name), id: undefined });
    }
  }

  const currencies = profiles.filter((p) => p.semantic === "currency_code");
  for (const amount of profiles.filter((p) => p.semantic === "monetary_amount")) {
    for (const cur of currencies) {
      add(cur.name, {
        dimension: "Integrity",
        type: "conditional_required",
        params: { when_column: amount.name },
        description: `every ${amount.name} must carry a ${cur.name}`,
      });
    }
  }

  // Jurisdiction-pack rules were added without ids above; give them stable ones.
  return rules.map((r, i) => (r.id ? r : { ...r, id: `B:${r.dimension}:${r.type}:${r.column}:${jurisdiction}${i}` }));
};
