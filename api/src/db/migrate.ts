import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client.js";

// api/drizzle, at the same relative path from src/db (tsx) and dist/db (compiled)
const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

// Any number, as long as every api pod uses the same one
const MIGRATION_LOCK_ID = 7_342_001;

export async function runMigrations(): Promise<void> {
  // Several api pods can start together: the lock lets only one apply the migrations at a time,
  // the others wait, then find them already applied
  const lockClient = await pool.connect();
  try {
    await lockClient.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await migrate(db, { migrationsFolder });
  } finally {
    try {
      await lockClient.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]);
    } finally {
      lockClient.release();
    }
  }
}
