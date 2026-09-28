import "dotenv/config";
import { createApp } from "./app.js";
import { closeDatabaseConnections } from "./utils/db.js";
import { Jobs } from "./pipeline/jobStore.js";

const PORT = process.env.PORT || 7000;
const jobs = new Jobs();
const server = createApp({ jobs }).listen(PORT, () => {
  console.log(`data-plane listening on port ${PORT} (jobs: ${jobs.store.constructor.name})`);
});

const shutdown = async () => {
  console.log("Shutting down data-plane...");
  try {
    await closeDatabaseConnections();
    await jobs.store.close();
    server.close(() => process.exit(0));
  } catch (err) {
    console.error("Error during shutdown:", err);
    process.exit(1);
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
