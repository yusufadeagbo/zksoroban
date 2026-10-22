import { createApp } from "./app.js";
import { WorkerPool } from "./workerPool.js";

const PORT = parseInt(process.env.PORT || "3000", 10);
const poolSize = process.env.WORKER_POOL_SIZE
  ? parseInt(process.env.WORKER_POOL_SIZE, 10)
  : undefined;

const workerPool = new WorkerPool(poolSize);
const app = createApp({ workerPool });

const server = app.listen(PORT, () => {
  console.log(`[proof-server] Listening on port ${PORT}`);
  console.log(`[proof-server] Worker pool initialized with ${workerPool.size} workers`);
  if (process.env.API_KEY) {
    console.log("[proof-server] API key authentication enabled");
  } else {
    console.log("[proof-server] Authentication disabled (API_KEY not set)");
  }
});

async function shutdown(): Promise<void> {
  console.log("[proof-server] Shutting down gracefully...");
  server.close(async () => {
    await workerPool.close();
    console.log("[proof-server] Closed worker pool and HTTP server");
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
