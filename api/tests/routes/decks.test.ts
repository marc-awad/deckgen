import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { insertDeck, selectCards, useTestDatabase } from "../helpers/test-db.js";

vi.mock("../../src/db/client.js", () => import("../helpers/test-db.js"));
useTestDatabase();

const app = createApp();

describe("POST /decks", () => {
  it("creates a deck with the trimmed name", async () => {
    const response = await request(app).post("/decks").send({ name: "  Docker  " });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ id: 1, name: "Docker", createdAt: expect.any(String) });
  });

  it("answers 422 with the field in error for an empty name", async () => {
    const response = await request(app).post("/decks").send({ name: "   " });

    expect(response.status).toBe(422);
    expect(response.body.errors).toEqual([{ field: "name", message: expect.any(String) }]);
  });

  it("answers 422 for a name over 100 characters", async () => {
    const response = await request(app).post("/decks").send({ name: "x".repeat(101) });

    expect(response.status).toBe(422);
  });
});

describe("GET /decks", () => {
  it("lists the decks from newest to oldest with their card count", async () => {
    await insertDeck("Ancien", [
      { front: "Q1", back: "R1" },
      { front: "Q2", back: "R2" },
    ]);
    await insertDeck("Récent");

    const response = await request(app).get("/decks");

    expect(response.status).toBe(200);
    expect(response.body.map((deck: { name: string; cardCount: number }) => [deck.name, deck.cardCount])).toEqual([
      ["Récent", 0],
      ["Ancien", 2],
    ]);
  });

  it("returns an empty list when there is no deck", async () => {
    const response = await request(app).get("/decks");

    expect(response.body).toEqual([]);
  });
});

describe("GET /decks/:id", () => {
  it("returns the deck with its cards sorted by id", async () => {
    const deck = await insertDeck("Docker", [
      { front: "Q1", back: "R1" },
      { front: "Q2", back: "R2" },
    ]);

    const response = await request(app).get(`/decks/${deck.id}`);

    expect(response.status).toBe(200);
    expect(response.body.name).toBe("Docker");
    expect(response.body.cards.map((card: { front: string }) => card.front)).toEqual(["Q1", "Q2"]);
  });

  it("answers 404 for an unknown deck", async () => {
    const response = await request(app).get("/decks/999");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ detail: "Deck introuvable" });
  });
});

describe("PUT /decks/:id", () => {
  it("renames the deck", async () => {
    const deck = await insertDeck("Docker");

    const response = await request(app).put(`/decks/${deck.id}`).send({ name: " Kubernetes " });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe("Kubernetes");
  });

  it("answers 404 for an unknown deck", async () => {
    const response = await request(app).put("/decks/999").send({ name: "Kubernetes" });

    expect(response.status).toBe(404);
  });
});

describe("DELETE /decks/:id", () => {
  it("answers 204 without body", async () => {
    const deck = await insertDeck("Docker");

    const response = await request(app).delete(`/decks/${deck.id}`);

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
  });

  it("deletes the deck's cards through the ON DELETE CASCADE foreign key", async () => {
    const deck = await insertDeck("Docker", [{ front: "Q1", back: "R1" }]);
    await insertDeck("Autre", [{ front: "Q2", back: "R2" }]);

    await request(app).delete(`/decks/${deck.id}`);

    expect((await selectCards()).map((card) => card.front)).toEqual(["Q2"]);
  });

  it("answers 404 for an unknown deck", async () => {
    const response = await request(app).delete("/decks/999");

    expect(response.status).toBe(404);
  });
});
