import { MongoClient } from "mongodb";
import pkg from "pg";

const { Client: PGClient } = pkg;

const mongoClients = new Map();
const pgClients = new Map();

/* ---------------------------
  MongoDB Connection Handler
---------------------------- */
export async function connectToMongo(uri) {
  if (mongoClients.has(uri)) {
    return mongoClients.get(uri);
  }

  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  });

  await client.connect();

  mongoClients.set(uri, client);

  console.log(
    `Connected to MongoDB (Pool Initialized for ${new URL(uri).hostname})`
  );

  return client;
}

/* ---------------------------
  PostgreSQL Connection Handler
---------------------------- */
export async function connectToPostgres(connectionString) {
  // Sanitize connection string
  let sanitizedConnStr = connectionString.trim();

  // Remove accidental "psql '...'"
  if (sanitizedConnStr.startsWith("psql ")) {
    sanitizedConnStr = sanitizedConnStr
      .replace(/^psql\s+['"]?/, "")
      .replace(/['"]?$/, "");
  }

  // Remove unsupported Neon option
  sanitizedConnStr = sanitizedConnStr.replace(
    /&channel_binding=require/g,
    ""
  );

  // Reuse existing client
  if (pgClients.has(sanitizedConnStr)) {
    return pgClients.get(sanitizedConnStr);
  }

  const isLocal =
    sanitizedConnStr.includes("localhost") ||
    sanitizedConnStr.includes("127.0.0.1");

  const client = new PGClient({
    connectionString: sanitizedConnStr,

    // Certificate verification is on by default; set PG_SSL_REJECT_UNAUTHORIZED=false
    // only for sources with self-signed certificates.
    ssl: isLocal
      ? false
      : {
          rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== "false",
        },

    // Force IPv4 (important for Neon + Docker)
    family: 4,

    connectionTimeoutMillis: 10000,
  });

  await client.connect();

  pgClients.set(sanitizedConnStr, client);

  console.log("Connected to PostgreSQL");

  return client;
}

/* ---------------------------
  Global Connection Closer
---------------------------- */
export async function closeDatabaseConnections() {
  // Close MongoDB
  for (const [uri, client] of mongoClients.entries()) {
    await client.close();

    console.log(
      `Closed MongoDB connection to ${new URL(uri).hostname}`
    );
  }

  mongoClients.clear();

  // Close PostgreSQL
  for (const [connStr, client] of pgClients.entries()) {
    await client.end();

    console.log("Closed PostgreSQL connection");
  }

  pgClients.clear();
}