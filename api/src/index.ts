import { createApp } from "./app.js";
import { config } from "./config.js";
import { pingDatabase, pool } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { logger } from "./logger.js";

// Maximum time given to in-flight requests before forcing the exit
const SHUTDOWN_TIMEOUT_MS = 10_000;

// Startup failure: exit with code 1 and let the orchestrator restart the container
async function exitWithError(err: unknown, message: string): Promise<never> {
  logger.fatal({ err }, message);
  await pool.end();
  process.exit(1);
}

try {
  await pingDatabase();
} catch (err) {
  await exitWithError(err, `Database unreachable at ${config.DB_HOST}:${config.DB_PORT}`);
}

logger.info({ database: config.POSTGRES_DB }, "Applying database migrations");
try {
  await runMigrations();
} catch (err) {
  await exitWithError(err, "Database migrations failed");
}

// The server only starts listening once the database schema is up to date
const server = createApp().listen(config.PORT, () => {
  logger.info({ port: config.PORT }, "API listening");
});

// Graceful shutdown, so that rolling updates do not cut requests in progress
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, "Shutdown signal received");
  setTimeout(() => {
    logger.error("Shutdown timeout reached, forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  // Stop accepting new connections and wait for in-flight requests to finish
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
  logger.info("Shutdown complete");
  process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
