import { eq } from "drizzle-orm";
import { Router } from "express";
import { db } from "../db/client.js";
import { cards } from "../db/schema.js";
import { HttpError } from "../errors.js";
import { cardBody, idParams } from "../schemas.js";

export const cardsRouter = Router();

cardsRouter.put("/cards/:id", async (req, res) => {
  const { id } = idParams.parse(req.params);
  const { front, back } = cardBody.parse(req.body);
  const [card] = await db.update(cards).set({ front, back }).where(eq(cards.id, id)).returning();
  if (!card) {
    throw new HttpError(404, "Carte introuvable");
  }
  res.json(card);
});

cardsRouter.delete("/cards/:id", async (req, res) => {
  const { id } = idParams.parse(req.params);
  const deleted = await db.delete(cards).where(eq(cards.id, id)).returning({ id: cards.id });
  if (deleted.length === 0) {
    throw new HttpError(404, "Carte introuvable");
  }
  res.status(204).end();
});
