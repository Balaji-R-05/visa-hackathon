import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';


// Utility to infer data type simply (string, number, boolean, object, null)
function inferDataType(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return 'numeric';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'object') {
    if (value instanceof Date) return 'datetime';
    return 'object';
  }
  return 'unknown';
}

export const apiDataExtraction = async (req, res) => {
  try {
    const { apiUrl } = req.body;

    if (!apiUrl) {
      return res.status(400).json({ message: 'API URL is required' });
    }

    // Fetch data from user-provided API URL
    const response = await axios.get(apiUrl);
    const data = response.data;

    if (!Array.isArray(data)) {
      return res.status(400).json({ message: 'API did not return an array of data' });
    }

    if (data.length === 0) {
      return res.status(200).json({
        dataset: {
          dataset_id: uuidv4(),
          dataset_name: apiUrl,
          row_count: 0,
          column_count: 0,
          detected_domain: 'API Source',
          ingestion_timestamp: new Date().toISOString(),
        },
        columns: [],
        numeric_stats: {},
        categorical_stats: {},
        temporal_stats: {},
        patterns: {},
        compliance_flags: {},
      });
    }

    // Extract schema
    const schema = Object.keys(data[0]);

    // Build columns data
    const columns = {};
    schema.forEach(col => {
      columns[col] = data.map(row => row[col]);
    });

    // Helper for unique counts
    const uniqueCount = arr => new Set(arr.filter(v => v !== null && v !== undefined)).size;

    // Build column metadata
    const columnsMetadata = schema.map(col => {
      const colData = columns[col];
      const nullCount = colData.filter(v => v === null || v === undefined).length;
      const uniqueCnt = uniqueCount(colData);
      const sampleValues = colData
        .filter(v => v !== null && v !== undefined)
        .slice(0, 3)
        .map(v => {
          if (typeof v === 'string' && v.length > 10) return v.slice(0, 5) + '***'; // simple masking
          return v;
        });

      return {
        column_name: col,
        inferred_data_type: inferDataType(colData.find(v => v !== null && v !== undefined)),
        null_count: nullCount,
        null_ratio: nullCount / data.length,
        unique_count: uniqueCnt,
        unique_ratio: uniqueCnt / data.length,
        sample_values_masked: sampleValues,
      };
    });

    // You can add numeric_stats, categorical_stats, temporal_stats, patterns, compliance_flags here as needed
    // For demo, keep them empty

    const metadata = {
      dataset: {
        dataset_id: uuidv4(),
        dataset_name: apiUrl,
        row_count: data.length,
        column_count: schema.length,
        detected_domain: 'API Source',
        ingestion_timestamp: new Date().toISOString(),
      },
      columns: columnsMetadata,
      numeric_stats: {},
      categorical_stats: {},
      temporal_stats: {},
      patterns: {},
      compliance_flags: {},
    };

    return res.status(200).json(metadata);

  } catch (error) {
    console.error('Error fetching or processing API data:', error.message);
    return res.status(500).json({
      message: 'Failed to fetch or process API data',
      error: error.message,
    });
  }
};
