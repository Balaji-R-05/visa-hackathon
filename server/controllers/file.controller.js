import { v4 as uuidv4 } from "uuid";
import csv from "csv-parser";
import { Readable } from "stream";

/* ---------------------------
  Helper: Parse CSV from buffer
---------------------------- */
export const parseCSV = (buffer) => {
  return new Promise((resolve, reject) => {
    const rows = [];
    Readable.from(buffer)
      .pipe(csv())
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", (err) => reject(err));
  });
};

/* ---------------------------
  Dataset-level metadata
---------------------------- */
export const extractDatasetMetadata = (rows, file) => {
  return {
    dataset_id: uuidv4(),
    dataset_name: file.name,
    row_count: rows.length,
    column_count: rows.length ? Object.keys(rows[0]).length : 0,
    detected_domain: "Unknown",
    ingestion_timestamp: new Date().toISOString(),
  };
};

/* ---------------------------
  Infer column type
---------------------------- */
const inferType = (values) => {
  if (values.every((v) => !isNaN(v))) return "numeric";
  if (values.every((v) => !isNaN(Date.parse(v)))) return "datetime";
  return "string";
};

/* ---------------------------
  Column-level metadata
---------------------------- */
export const extractColumnMetadata = (rows) => {
  const columns = Object.keys(rows[0] || {});
  const rowCount = rows.length;

  return columns.map((col) => {
    const values = rows.map((r) => r[col]);
    const nonNull = values.filter((v) => v !== "" && v != null);
    const unique = new Set(nonNull);

    return {
      column_name: col,
      inferred_data_type: inferType(nonNull),
      null_count: rowCount - nonNull.length,
      null_ratio: (rowCount - nonNull.length) / rowCount,
      unique_count: unique.size,
      unique_ratio: unique.size / rowCount,
      sample_values_masked: nonNull.slice(0, 3).map(() => "***"),
    };
  });
};

/* ---------------------------
  Numeric stats
---------------------------- */
export const extractNumericStats = (rows) => {
  const stats = {};
  Object.keys(rows[0] || {}).forEach((col) => {
    const nums = rows.map((r) => Number(r[col])).filter((v) => !isNaN(v));
    if (!nums.length) return;

    stats[col] = {
      min_value: Math.min(...nums),
      max_value: Math.max(...nums),
      mean: nums.reduce((a, b) => a + b, 0) / nums.length,
      negative_value_ratio: nums.filter((v) => v < 0).length / nums.length,
    };
  });
  return stats;
};

/* ---------------------------
  Categorical stats
---------------------------- */
export const extractCategoricalStats = (rows) => {
  const stats = {};
  Object.keys(rows[0] || {}).forEach((col) => {
    const values = rows.map((r) => r[col]).filter(Boolean);
    const freq = {};
    values.forEach((v) => (freq[v] = (freq[v] || 0) + 1));
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    if (sorted.length) {
      stats[col] = {
        distinct_values: sorted.length,
        top_values: sorted.slice(0, 3).map((v) => v[0]),
      };
    }
  });
  return stats;
};

/* ---------------------------
  Temporal stats
---------------------------- */
export const extractTemporalStats = (rows) => {
  const stats = {};
  Object.keys(rows[0] || {}).forEach((col) => {
    const dates = rows.map((r) => new Date(r[col])).filter((d) => !isNaN(d));
    if (!dates.length) return;

    const now = new Date();
    stats[col] = {
      min_timestamp: new Date(Math.min(...dates)).toISOString(),
      max_timestamp: new Date(Math.max(...dates)).toISOString(),
      future_timestamp_ratio: dates.filter((d) => d > now).length / dates.length,
      stale_record_ratio:
        dates.filter((d) => now - d > 365 * 24 * 60 * 60 * 1000).length / dates.length,
    };
  });
  return stats;
};

/* ---------------------------
  Patterns (regex example)
---------------------------- */
export const extractPatterns = (rows) => {
  const patterns = {};
  Object.keys(rows[0] || {}).forEach((col) => {
    const values = rows.map((r) => r[col]).filter(Boolean);
    const regex = /^[A-Z]{3}\d+/; // Example pattern
    const matches = values.filter((v) => regex.test(v)).length;
    if (matches > 0) {
      patterns[col] = {
        regex_match_ratio: matches / values.length,
      };
    }
  });
  return patterns;
};

/* ---------------------------
  Compliance flags
---------------------------- */
export const extractComplianceFlags = (columns) => {
  const columnNamesLower = columns.map((c) => c.column_name.toLowerCase());
  return {
    kyc_fields_present: columnNamesLower.some(
      (n) => n.includes("kyc") || n.includes("address")
    ),
    monetary_fields_present: columnNamesLower.some(
      (n) => n.includes("amount") || n.includes("price")
    ),
    personal_data_present: columnNamesLower.some((n) =>
      ["name", "email", "phone"].some((p) => n.includes(p))
    ),
  };
};

/* ---------------------------
  Main controller function
---------------------------- */
export const fileMetaDataExtraction = async (req, res) => {
  try {
    const file = req.files?.file;
    if (!file) return res.status(400).json({ message: "No file uploaded" });

    const rows = await parseCSV(file.data);

    const dataset = extractDatasetMetadata(rows, file);
    const columns = extractColumnMetadata(rows);

    const extractedMetadata = {
      dataset,
      columns,
      numeric_stats: extractNumericStats(rows),
      categorical_stats: extractCategoricalStats(rows),
      temporal_stats: extractTemporalStats(rows),
      patterns: extractPatterns(rows),
      compliance_flags: extractComplianceFlags(columns),
    };

    res.json(extractedMetadata);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
