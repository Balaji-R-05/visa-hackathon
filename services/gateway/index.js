import "dotenv/config";
import { createApp, UPSTREAMS } from "./app.js";

const PORT = process.env.PORT || 5000;
const server = createApp().listen(PORT, () => {
  console.log(`gateway listening on port ${PORT}; upstreams: ${JSON.stringify(UPSTREAMS)}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
