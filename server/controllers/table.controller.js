// table.controller.js
import { MongoClient } from "mongodb";
import { Client as PGClient } from "pg";
import { buildFullMetadata } from "../utils/metadataExtractor.js";

/* ---------------------------
  Main controller: MongoDB
---------------------------- */
export const tableMetaDataExtractionMongo = async (req, res) => {
  try {
    const { uri, dbName, collectionName } = req.body;
    if (!uri || !dbName || !collectionName)
      return res.status(400).json({ message: "Missing parameters" });

    const client = new MongoClient(uri);
    await client.connect();
    const collection = client.db(dbName).collection(collectionName);
    const rows = await collection.find({}).toArray();
    await client.close();

    const metadata = buildFullMetadata(rows, collectionName);
    res.json(metadata);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ---------------------------
  Main controller: PostgreSQL
---------------------------- */
export const tableMetaDataExtractionPostgres = async (req, res) => {
  try {
    const { connectionString, tableName } = req.body;
    if (!connectionString || !tableName)
      return res.status(400).json({ message: "Missing parameters" });

    // Validate table name to prevent SQL injection
    if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(tableName)) {
      return res.status(400).json({ message: "Invalid table name" });
    }

    const client = new PGClient({ connectionString });
    await client.connect();

    const { rows } = await client.query(`SELECT * FROM "${tableName}" LIMIT 1000`);
    await client.end();

    const metadata = buildFullMetadata(rows, tableName);
    res.json(metadata);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
