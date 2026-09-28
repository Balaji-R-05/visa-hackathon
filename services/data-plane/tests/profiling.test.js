import { describe, it, expect } from "vitest";
import { buildFullMetadata, detectSemanticType, inferType, normalizeValue } from "../utils/metadataExtractor.js";
import { luhnValid, shapeOf } from "../utils/patterns.js";

const row = (i, over = {}) => ({
  transaction_id: `TXN${String(i).padStart(6, "0")}`,
  amount: String(100 + i),
  currency: ["INR", "USD", "EUR"][i % 3],
  txn_timestamp: "2026-09-01 10:00:00",
  pan_number: `ABCDE${String(1000 + i).slice(-4)}F`,
  email: `user${i}@bank.com`,
  customer_name: `Customer ${i}`,
  ...over,
});
const rows = (n, over) => Array.from({ length: n }, (_, i) => row(i, typeof over === "function" ? over(i) : over));
const NOW = Date.parse("2026-09-15T00:00:00Z");

describe("value handling", () => {
  it("flattens driver types", () => {
    expect(normalizeValue(new Date("2026-01-02T03:04:05Z"))).toBe("2026-01-02T03:04:05.000Z");
    expect(normalizeValue({ toHexString: () => "abc123" })).toBe("abc123");
    expect(normalizeValue(true)).toBe("true");
    expect(normalizeValue(null)).toBe(null);
  });

  it("infers types without treating empty strings as numbers", () => {
    expect(inferType(["1", "2.5", "-3"])).toBe("numeric");
    expect(inferType(["2026-01-01", "2026-02-01"])).toBe("datetime");
    expect(inferType([])).toBe("empty");
  });

  it("checks Luhn and builds format masks", () => {
    expect(luhnValid("4111111111111111")).toBe(true);
    expect(luhnValid("4111111111111112")).toBe(false);
    expect(shapeOf("ABCDE1234F")).toBe("AAAAA9999A");
    expect(shapeOf("x".repeat(30))).toBe(`${"a".repeat(24)}…(30)`);
  });

  it("detects payment semantic types from values, not just names", () => {
    expect(detectSemanticType("col_a", ["4111111111111111", "5500005555555559"], "numeric", 2)).toBe("card_pan");
    expect(detectSemanticType("col_b", ["ABCDE1234F", "PQRST6789Z"], "string", 2)).toBe("tax_id_pan");
    expect(detectSemanticType("col_c", ["INR", "USD", "EUR"], "string", 3)).toBe("currency_code");
    expect(detectSemanticType("cvv", ["123"], "numeric", 1)).toBe("card_security_code");
  });
});

describe("buildFullMetadata", () => {
  const md = buildFullMetadata(
    rows(120, (i) => (i % 10 === 0 ? { amount: "", currency: "inr", pan_number: "ABC" } : {})),
    "t.csv", "Unknown", "csv", { now: NOW, jurisdiction: "IN" },
  );

  it("never carries raw values of sensitive or high-cardinality columns", () => {
    const text = JSON.stringify(md);
    expect(text).not.toContain("user1@bank.com");
    expect(text).not.toContain("Customer 1");
    expect(text).not.toContain("ABCDE1234F");
    expect(md.categorical_stats.email.top_values_suppressed).toBe(true);
    expect(md.categorical_stats.currency.values).toEqual(expect.arrayContaining(["INR", "USD", "EUR", "inr"]));
    expect(md.numeric_stats.amount).toBeDefined();
    expect(md.governance.raw_values_included).toBe(false);
  });

  it("types and tags columns", () => {
    const col = (n) => md.columns.find((c) => c.column_name === n);
    expect(col("pan_number").semantic_type).toBe("tax_id_pan");
    expect(col("pan_number").sensitivity).toEqual(["kyc"]);
    expect(col("email").sensitivity).toContain("pii");
    expect(col("transaction_id").is_key).toBe(true);
    expect(md.dataset.detected_domain).toBe("Payments");
  });

  it("executes built-in rules and measures the injected defects", () => {
    const check = (d, c) => md.rule_evaluation.column_checks.find((x) => x.dimension === d && x.column === c);
    expect(check("Completeness", "amount").violations).toBe(12);
    expect(check("Validity", "pan_number").violations).toBe(12);
    expect(check("Validity", "currency").violations).toBe(0); // ISO check is case-insensitive
    expect(md.format_stats.currency.check).toBe("case_variant");
    expect(md.format_stats.currency.violations).toBe(12);      // ...and case drift is Consistency
    expect(md.format_stats.pan_number.check).toBe("fixed_format");
    expect(check("Timeliness", "txn_timestamp").violations).toBe(0);
  });

  it("finds exact duplicate rows", () => {
    const dup = buildFullMetadata([...rows(10), row(3), row(4)], "d.csv", "Unknown", "csv", { now: NOW });
    expect(dup.cross_column_stats.duplicate_row_count).toBe(2);
    expect(dup.cross_column_stats.key_duplicate_ratio.transaction_id).toBeCloseTo(2 / 12);
  });

  it("handles heterogeneous Mongo documents and native dates", () => {
    const docs = [{ _id: { toHexString: () => "a1" }, at: new Date("2026-09-01") }, { _id: { toHexString: () => "a2" }, extra: 1 }];
    const m = buildFullMetadata(docs, "c", "Unknown", "mongodb", { now: NOW });
    expect(m.columns.map((c) => c.column_name)).toEqual(["_id", "at", "extra"]);
    expect(m.columns.find((c) => c.column_name === "at").semantic_type).toBe("timestamp");
  });

  it("flags stored card verification codes and unmasked PANs", () => {
    const m = buildFullMetadata(
      Array.from({ length: 5 }, () => ({ card_number: "4111111111111111", cvv: "123" })), "cards.csv", "Unknown", "csv", { now: NOW },
    );
    expect(m.compliance_flags.pci_fields_present).toBe(true);
    expect(m.compliance_flags.prohibited_data.join(" ")).toMatch(/Req\. 3\.3.*\n?|3\.5\.1/);
    expect(JSON.stringify(m)).not.toContain("4111111111111111");
  });
});
