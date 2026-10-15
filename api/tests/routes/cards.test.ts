import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { insertDeck, selectCards, useTestDatabase } from "../helpers/test-db.js";

vi.mock("../../src/db/client.js", () => import("../helpers/test-db.js"));
useTestDatabase();

const app = createApp();

describe("PUT /cards/:id", () => {
  it("updates the card with the trimmed texts and returns it", async () => {
    const deck = await insertDeck("Docker", [{ front: "Q", back: "R" }]);

    const response = await request(app).put("/cards/1").send({ front: " Nouvelle ? ", back: " Oui. " });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: 1,
      deckId: deck.id,
      front: "Nouvelle ?",
      back: "Oui.",
      createdAt: expect.any(String),
    });
  });

  it("saves the change in the database", async () => {
    await insertDeck("Docker", [{ front: "Q", back: "R" }]);

    await request(app).put("/cards/1").send({ front: "Nouvelle ?", back: "Oui." });

    expect((await selectCards())[0].front).toBe("Nouvelle ?");
  });

  it.each([
    { case: "an empty front", body: { front: "  ", back: "R" }, field: "front" },
    { case: "a back over 500 characters", body: { front: "Q", back: "x".repeat(501) }, field: "back" },
  ])("answers 422 for $case", async ({ body, field }) => {
    await insertDeck("Docker", [{ front: "Q", back: "R" }]);

    const response = await request(app).put("/cards/1").send(body);

    expect(response.status).toBe(422);
    expect(response.body.errors[0].field).toBe(field);
  });

  it("answers 404 for an unknown card", async () => {
    const response = await request(app).put("/cards/999").send({ front: "Q", back: "R" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ detail: "Carte introuvable" });
  });
});

describe("DELETE /cards/:id", () => {
  it("deletes only this card and answers 204", async () => {
    await insertDeck("Docker", [
      { front: "Q1", back: "R1" },
      { front: "Q2", back: "R2" },
    ]);

    const response = await request(app).delete("/cards/1");

    expect(response.status).toBe(204);
    expect((await selectCards()).map((card) => card.front)).toEqual(["Q2"]);
  });

  it("answers 404 for an unknown card", async () => {
    const response = await request(app).delete("/cards/999");

    expect(response.status).toBe(404);
  });
});
