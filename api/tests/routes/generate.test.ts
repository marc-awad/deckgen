import { eq } from "drizzle-orm";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { decks } from "../../src/db/schema.js";
import {
  GeneratorInvalidResponseError,
  GeneratorTimeoutError,
  GeneratorUnavailableError,
  generateCards,
} from "../../src/services/generator-client.js";
import { db, insertDeck, selectCards, useTestDatabase } from "../helpers/test-db.js";

vi.mock("../../src/db/client.js", () => import("../helpers/test-db.js"));
// Only generateCards is replaced: the error classes stay real, the route checks them with instanceof
vi.mock("../../src/services/generator-client.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/services/generator-client.js")>()),
  generateCards: vi.fn(),
}));
useTestDatabase();

const app = createApp();
const generateCardsMock = vi.mocked(generateCards);
const TEXT = "Un conteneur est un processus isolé grâce aux namespaces du noyau Linux.";
const GENERATED = [
  { front: "Qu'est-ce qu'un conteneur ?", back: "Un processus isolé." },
  { front: "Que limitent les cgroups ?", back: "Les ressources." },
];

afterEach(() => {
  generateCardsMock.mockReset();
});

describe("POST /decks/:id/generate", () => {
  it("answers 201 with the inserted cards", async () => {
    const deck = await insertDeck("Docker");
    generateCardsMock.mockResolvedValue(GENERATED);

    const response = await request(app).post(`/decks/${deck.id}/generate`).send({ text: TEXT });

    expect(response.status).toBe(201);
    expect(response.body.cards).toEqual(
      GENERATED.map((card) => ({ ...card, id: expect.any(Number), deckId: deck.id, createdAt: expect.any(String) })),
    );
  });

  it("adds the generated cards to the existing ones", async () => {
    const deck = await insertDeck("Docker", [{ front: "Ancienne ?", back: "Oui." }]);
    generateCardsMock.mockResolvedValue(GENERATED);

    await request(app).post(`/decks/${deck.id}/generate`).send({ text: TEXT });

    expect((await selectCards()).map((card) => card.front)).toEqual([
      "Ancienne ?",
      ...GENERATED.map((card) => card.front),
    ]);
  });

  it("sends the trimmed text and the default count of 5 to the generator", async () => {
    const deck = await insertDeck("Docker");
    generateCardsMock.mockResolvedValue(GENERATED);

    await request(app).post(`/decks/${deck.id}/generate`).send({ text: `   ${TEXT}   ` });

    expect(generateCardsMock).toHaveBeenCalledWith(TEXT, 5);
  });

  it.each([
    { case: "a text under 50 characters", body: { text: "Trop court" } },
    { case: "a count over 30", body: { text: TEXT, count: 31 } },
  ])("answers 422 for $case without calling the generator", async ({ body }) => {
    const deck = await insertDeck("Docker");

    const response = await request(app).post(`/decks/${deck.id}/generate`).send(body);

    expect(response.status).toBe(422);
    expect(generateCardsMock).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown deck without calling the generator", async () => {
    const response = await request(app).post("/decks/999/generate").send({ text: TEXT });

    expect(response.status).toBe(404);
    expect(generateCardsMock).not.toHaveBeenCalled();
  });

  it.each([
    { error: new GeneratorUnavailableError("down"), status: 503, detail: "Le service de génération est indisponible" },
    { error: new GeneratorTimeoutError("slow"), status: 504, detail: "La génération a pris trop de temps" },
    { error: new GeneratorInvalidResponseError("bad"), status: 502, detail: "Le modèle a renvoyé une réponse invalide" },
  ])("answers $status for a $error.constructor.name", async ({ error, status, detail }) => {
    const deck = await insertDeck("Docker");
    generateCardsMock.mockRejectedValue(error);

    const response = await request(app).post(`/decks/${deck.id}/generate`).send({ text: TEXT });

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ detail });
  });

  it("inserts no card when the generator fails", async () => {
    const deck = await insertDeck("Docker", [{ front: "Ancienne ?", back: "Oui." }]);
    generateCardsMock.mockRejectedValue(new GeneratorUnavailableError("down"));

    await request(app).post(`/decks/${deck.id}/generate`).send({ text: TEXT });

    expect(await selectCards()).toHaveLength(1);
  });

  it("answers 404 when the deck is deleted during the generation", async () => {
    const deck = await insertDeck("Docker");
    // The deck disappears while the generator is working
    generateCardsMock.mockImplementation(async () => {
      await db.delete(decks).where(eq(decks.id, deck.id));
      return GENERATED;
    });

    const response = await request(app).post(`/decks/${deck.id}/generate`).send({ text: TEXT });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ detail: "Deck introuvable" });
  });
});
