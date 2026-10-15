// In-memory PostgreSQL (PGlite) that replaces src/db/client.ts in the route tests:
// vi.mock("../../src/db/client.js", () => import("../helpers/test-db.js"))
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, beforeEach } from "vitest";
import * as schema from "../../src/db/schema.js";

const client = new PGlite();

// Same exports as src/db/client.ts, used by the routes
export const db = drizzle({ client, schema });

export async function pingDatabase(): Promise<void> {
  await client.query("SELECT 1");
}

// Real migrations of api/drizzle once per test file, then an empty database before each test
export function useTestDatabase(): void {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
  });
  beforeEach(async () => {
    await client.exec("TRUNCATE cards, decks RESTART IDENTITY CASCADE");
  });
}

// Test data, inserted directly in the database
export async function insertDeck(
  name: string,
  cardValues: { front: string; back: string }[] = [],
): Promise<typeof schema.decks.$inferSelect> {
  const [deck] = await db.insert(schema.decks).values({ name }).returning();
  if (cardValues.length > 0) {
    await db.insert(schema.cards).values(cardValues.map((card) => ({ ...card, deckId: deck.id })));
  }
  return deck;
}

export function selectCards(): Promise<(typeof schema.cards.$inferSelect)[]> {
  return db.select().from(schema.cards).orderBy(schema.cards.id);
}
