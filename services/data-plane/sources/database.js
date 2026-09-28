import { connectToMongo, connectToPostgres } from "../utils/db.js";

export const ROW_LIMIT = Number(process.env.DQ_DB_ROW_LIMIT || 1000);

const TABLE_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/;

export const loadMongo = async ({ uri, dbName, collectionName }) => {
  if (!uri || !dbName || !collectionName) throw Object.assign(new Error("Missing parameters"), { status: 400 });
  const client = await connectToMongo(uri);
  return client.db(dbName).collection(collectionName).find({}).limit(ROW_LIMIT).toArray();
};

export const loadPostgres = async ({ connectionString, tableName }) => {
  if (!connectionString || !tableName) throw Object.assign(new Error("Missing parameters"), { status: 400 });
  // Identifiers can't be bound as parameters, so the name is allow-listed and each part quoted.
  if (!TABLE_NAME_RE.test(tableName)) throw Object.assign(new Error("Invalid table name"), { status: 400 });
  const qualified = tableName.split(".").map((part) => `"${part}"`).join(".");
  const client = await connectToPostgres(connectionString);
  const { rows } = await client.query(`SELECT * FROM ${qualified} LIMIT $1`, [ROW_LIMIT]);
  return rows;
};
