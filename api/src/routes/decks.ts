import { asc, count, DrizzleQueryError, desc, eq } from "drizzle-orm";
import { Router } from "express";
import pg from "pg";
import { db } from "../db/client.js";
import { cards, decks } from "../db/schema.js";
import { HttpError } from "../errors.js";
import { logger } from "../logger.js";
import { deckBody, generateBody, idParams } from "../schemas.js";
import { buildAnkiExport, exportFileName } from "../services/anki-export.js";
import {
  type GeneratedCard,
  GeneratorInvalidResponseError,
  GeneratorTimeoutError,
  GeneratorUnavailableError,
  generateCards,
} from "../services/generator-client.js";

export const decksRouter = Router();

type Deck = typeof decks.$inferSelect;
type Card = typeof cards.$inferSelect;

// PostgreSQL error code for a foreign key violation
const FOREIGN_KEY_VIOLATION = "23503";

// Drizzle wraps the node-postgres error: the PostgreSQL code is in err.cause.code
function isForeignKeyViolation(err: unknown): boolean {
  return (
    err instanceof DrizzleQueryError &&
    err.cause instanceof pg.DatabaseError &&
    err.cause.code === FOREIGN_KEY_VIOLATION
  );
}

async function findDeck(id: number): Promise<Deck> {
  const [deck] = await db.select().from(decks).where(eq(decks.id, id));
  if (!deck) {
    throw new HttpError(404, "Deck introuvable");
  }
  return deck;
}

function findCards(deckId: number) {
  return db.select().from(cards).where(eq(cards.deckId, deckId)).orderBy(asc(cards.id));
}

// Generator errors become HTTP errors, the technical detail stays in the logs
function toHttpError(err: unknown): unknown {
  if (err instanceof GeneratorUnavailableError) {
    return new HttpError(503, "Le service de génération est indisponible");
  }
  if (err instanceof GeneratorTimeoutError) {
    return new HttpError(504, "La génération a pris trop de temps");
  }
  if (err instanceof GeneratorInvalidResponseError) {
    return new HttpError(502, "Le modèle a renvoyé une réponse invalide");
  }
  return err;
}

decksRouter.get("/decks", async (_req, res) => {
  // LEFT JOIN + GROUP BY: card counts in a single query, decks without cards included
  const rows = await db
    .select({
      id: decks.id,
      name: decks.name,
      createdAt: decks.createdAt,
      cardCount: count(cards.id),
    })
    .from(decks)
    .leftJoin(cards, eq(cards.deckId, decks.id))
    .groupBy(decks.id)
    .orderBy(desc(decks.createdAt), desc(decks.id));
  res.json(rows);
});

decksRouter.post("/decks", async (req, res) => {
  const { name } = deckBody.parse(req.body);
  const [deck] = await db.insert(decks).values({ name }).returning();
  res.status(201).json(deck);
});

decksRouter.get("/decks/:id", async (req, res) => {
  const { id } = idParams.parse(req.params);
  const deck = await findDeck(id);
  res.json({ ...deck, cards: await findCards(id) });
});

decksRouter.put("/decks/:id", async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { name } = deckBody.parse(req.body);
  const [deck] = await db.update(decks).set({ name }).where(eq(decks.id, id)).returning();
  if (!deck) {
    throw new HttpError(404, "Deck introuvable");
  }
  res.json(deck);
});

decksRouter.delete("/decks/:id", async (req, res) => {
  const { id } = idParams.parse(req.params);
  // The deck's cards are deleted by the ON DELETE CASCADE foreign key
  const deleted = await db.delete(decks).where(eq(decks.id, id)).returning({ id: decks.id });
  if (deleted.length === 0) {
    throw new HttpError(404, "Deck introuvable");
  }
  res.status(204).end();
});

decksRouter.post("/decks/:id/generate", async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { text, count } = generateBody.parse(req.body);
  await findDeck(id);

  let generated: GeneratedCard[];
  try {
    generated = await generateCards(text, count);
  } catch (err) {
    logger.error({ err, deckId: id }, "Card generation failed");
    throw toHttpError(err);
  }

  // Generated cards are added to the existing ones, in a single INSERT
  let inserted: Card[];
  try {
    inserted = await db
      .insert(cards)
      .values(generated.map((card) => ({ deckId: id, front: card.front, back: card.back })))
      .returning();
  } catch (err) {
    // The deck was deleted while the cards were being generated
    if (isForeignKeyViolation(err)) {
      logger.warn({ deckId: id }, "Deck deleted during card generation");
      throw new HttpError(404, "Deck introuvable");
    }
    throw err;
  }
  res.status(201).json({ cards: inserted });
});

decksRouter.get("/decks/:id/export", async (req, res) => {
  const { id } = idParams.parse(req.params);
  const deck = await findDeck(id);
  const content = buildAnkiExport(deck.name, await findCards(id));
  res
    .attachment(exportFileName(deck.id, deck.name))
    .type("text/plain; charset=utf-8")
    .send(content);
});
