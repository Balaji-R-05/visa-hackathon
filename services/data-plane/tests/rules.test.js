import { describe, it, expect } from "vitest";
import { builtinRules, executeRules, validateRule } from "../utils/ruleEngine.js";

const columns = {
  id: ["1", "2", "3", "3", ""],
  amount: ["10", "-5", "abc", "20", "30"],
  currency: ["INR", "", "usd", "XXX", "EUR"],
  created: ["2026-09-01", "2026-09-02", "2099-01-01", "2020-01-01", "2026-09-03"],
  settled: ["2026-09-02", "2026-09-01", "", "2020-01-02", "2026-09-04"],
  ifsc: ["HDFC0001234", "BAD", "SBIN0000001", "", "ICIC0ABC123"],
};
const NOW = Date.parse("2026-09-15T00:00:00Z");
const r = (type, column, params = {}, dimension = "Validity") => ({ id: `${type}:${column}`, type, column, params, dimension });

describe("validateRule", () => {
  const names = Object.keys(columns);
  it("rejects unsafe or malformed rules with reasons", () => {
    expect(validateRule(r("regex", "ifsc", { pattern: "^(a+)+$" }), names).reason).toMatch(/nested quantifiers/);
    expect(validateRule(r("regex", "ifsc", { pattern: "[" }), names).reason).toMatch(/invalid regex/);
    expect(validateRule(r("regex", "nope", { pattern: "x" }), names).reason).toMatch(/does not exist/);
    expect(validateRule(r("range", "amount", {}), names).reason).toMatch(/min or max/);
    expect(validateRule({ ...r("not_null", "id"), dimension: "Beauty" }, names).reason).toMatch(/unknown dimension/);
    expect(validateRule(r("drop_table", "id"), names).reason).toMatch(/unknown rule type/);
    expect(validateRule(r("column_compare", "settled", { op: ">=", other_column: "ghost" }), names).reason).toMatch(/other_column/);
  });
});

describe("executeRules", () => {
  const run = (rules) => executeRules(columns, 5, rules, { now: NOW });

  it("evaluates each rule type", () => {
    const res = run([
      r("not_null", "currency", {}, "Completeness"),
      r("range", "amount", { min: 0 }),
      r("allowed_values", "currency", { values: ["INR", "USD", "EUR"], case_sensitive: false }),
      r("regex", "ifsc", { pattern: "^[A-Z]{4}0[A-Z0-9]{6}$" }),
      r("date_not_future", "created", { tolerance_days: 1 }, "Timeliness"),
      r("date_max_age", "created", { max_age_days: 365 }, "Timeliness"),
      r("column_compare", "settled", { op: ">=", other_column: "created" }, "Integrity"),
      r("unique", "id", {}, "Uniqueness"),
    ]);
    const v = Object.fromEntries(res.rules.map((x) => [x.id, [x.violations, x.checked]]));
    expect(v["not_null:currency"]).toEqual([1, 5]);
    expect(v["range:amount"]).toEqual([2, 5]);          // negative and non-numeric
    expect(v["allowed_values:currency"]).toEqual([1, 4]); // XXX; empty is skipped
    expect(v["regex:ifsc"]).toEqual([1, 4]);
    expect(v["date_not_future:created"]).toEqual([1, 5]);
    expect(v["date_max_age:created"]).toEqual([1, 5]);
    expect(v["column_compare:settled"]).toEqual([1, 4]);
    expect(v["unique:id"]).toEqual([1, 4]);
  });

  it("combines rules on the same column with union semantics", () => {
    const res = run([
      { ...r("date_not_future", "created", {}, "Timeliness"), id: "a" },
      { ...r("date_max_age", "created", { max_age_days: 365 }, "Timeliness"), id: "b" },
      { ...r("date_parseable", "created", {}, "Timeliness"), id: "c" },
    ]);
    const cc = res.column_checks.find((c) => c.column === "created");
    expect(cc).toMatchObject({ checked: 5, violations: 2, rule_ids: ["a", "b", "c"] });
  });

  it("reports rejected rules without executing them", () => {
    const res = run([r("regex", "ifsc", { pattern: "(x+)+" }), r("not_null", "id", {}, "Completeness")]);
    expect(res.rules).toHaveLength(1);
    expect(res.rejected[0].reason).toMatch(/nested/);
  });

  it("rejects well-formed rules with type errors", () => {
    const semantics = { id: "identifier", created: "timestamp" };
    const dobColumns = { ...columns, date_of_birth: columns.created };
    const res = executeRules(dobColumns, 5, [
      r("range", "id", { min: 13, max: 16 }),                               // meant as a length
      r("date_max_age", "date_of_birth", { max_age_days: 36500 }, "Timeliness"),  // not an event time
      r("range", "amount", { min: 0 }),                                      // fine: a quantity
    ], { now: NOW, semantics });
    expect(res.rejected.map((x) => x.reason)).toEqual([
      expect.stringMatching(/range compares numeric magnitudes/),
      expect.stringMatching(/not an event timestamp/),
    ]);
    expect(res.rules.map((x) => x.column)).toEqual(["amount"]);
  });
});

describe("sanity hold for LLM rules", () => {
  const many = { code: Array.from({ length: 40 }, (_, i) => (i < 30 ? "BAD" : "OK")) };
  const llm = (extra = {}) => ({ id: "L1", source: "llm", dimension: "Validity", type: "allowed_values", column: "code", params: { values: ["OK"] }, ...extra });

  it("holds an unreviewed LLM rule that fails most values, and does not score it", () => {
    const res = executeRules(many, 40, [llm()], { now: NOW });
    expect(res.rules[0]).toMatchObject({ status: "held", violations: 30, checked: 40 });
    expect(res.rules[0].hold_reason).toMatch(/75\.0%/);
    expect(res.column_checks).toEqual([]);
  });

  it("enforces the same rule once approved, and never holds built-in rules", () => {
    const approved = executeRules(many, 40, [llm({ approved: true })], { now: NOW });
    expect(approved.rules[0].status).toBe("applied");
    expect(approved.column_checks[0]).toMatchObject({ violations: 30 });
    const builtin = executeRules(many, 40, [llm({ source: "builtin" })], { now: NOW });
    expect(builtin.rules[0].status).toBe("applied");
  });

  it("keeps plausible LLM rules and respects the threshold", () => {
    const mostlyFine = { code: Array.from({ length: 40 }, (_, i) => (i < 4 ? "BAD" : "OK")) };
    expect(executeRules(mostlyFine, 40, [llm()], { now: NOW }).rules[0].status).toBe("applied");
    expect(executeRules(many, 40, [llm()], { now: NOW, suspectRatio: 0.8 }).rules[0].status).toBe("applied");
  });
});

describe("builtinRules", () => {
  const profiles = [
    { name: "txn_id", semantic: "identifier", isKey: true },
    { name: "amount", semantic: "monetary_amount", isKey: false },
    { name: "currency", semantic: "currency_code", isKey: false },
    { name: "created_at", semantic: "timestamp", isKey: false },
    { name: "date_of_birth", semantic: "timestamp", isKey: false },
    { name: "ifsc_code", semantic: "string", isKey: false },
    { name: "iban", semantic: "string", isKey: false },
  ];

  it("derives rules from semantic types", () => {
    const ids = builtinRules(profiles).map((x) => `${x.dimension}:${x.type}:${x.column}`);
    expect(ids).toEqual(expect.arrayContaining([
      "Integrity:not_null:txn_id", "Validity:range:amount", "Validity:allowed_values:currency",
      "Timeliness:date_not_future:created_at", "Integrity:conditional_required:currency",
    ]));
    expect(ids).not.toContain("Timeliness:date_max_age:date_of_birth");
  });

  it("adds jurisdiction packs by column name", () => {
    const packRules = (j) => builtinRules(profiles, { jurisdiction: j }).filter((x) => x.type === "regex").map((x) => `${x.column}:${x.regulation}`);
    expect(packRules("IN")).toEqual(["ifsc_code:RBI IFSC scheme"]);
    expect(packRules("EU")).toEqual(["iban:ISO 13616"]);
    expect(packRules("GLOBAL")).toEqual([]);
  });

  it("drops the age check when the freshness window is 0", () => {
    const types = (days) => builtinRules(profiles, { freshnessDays: days }).filter((x) => x.column === "created_at").map((x) => x.type);
    expect(types(365)).toContain("date_max_age");
    expect(types(0)).not.toContain("date_max_age");
    expect(types(0)).toContain("date_not_future");
  });

  it("respects optional columns", () => {
    const rules = builtinRules(profiles, { optionalColumns: ["iban"] });
    expect(rules.some((x) => x.column === "iban" && x.type === "not_null")).toBe(false);
  });
});
