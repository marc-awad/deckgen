import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { config } from "../config.js";
import { logger } from "../logger.js";
import * as schema from "./schema.js";

export const pool = new pg.Pool({
  host: config.DB_HOST,
  port: config.DB_PORT,
  user: config.POSTGRES_USER,
  password: config.POSTGRES_PASSWORD,
  database: config.POSTGRES_DB,
  // Fail fast instead of waiting when the database does not answer
  connectionTimeoutMillis: 5000,
});

// An idle connection can break (e.g. database restart): log it instead of crashing the process
pool.on("error", (err) => {
  logger.error({ err }, "Idle database connection error");
});

export const db = drizzle({ client: pool, schema });

// Throws the original pg error (e.g. ECONNREFUSED) when the database does not answer
export async function pingDatabase(): Promise<void> {
  await pool.query("SELECT 1");
}
