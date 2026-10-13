import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { insertDeck, useTestDatabase } from "../helpers/test-db.js";

vi.mock("../../src/db/client.js", () => import("../helpers/test-db.js"));
useTestDatabase();

const app = createApp();

describe("GET /decks/:id/export", () => {
  it("sends a UTF-8 text file as an attachment with a safe file name", async () => {
    const deck = await insertDeck("Réseaux & Docker", [{ front: "Q", back: "R" }]);

    const response = await request(app).get(`/decks/${deck.id}/export`);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/plain; charset=utf-8");
    // Express quotes the file name only when needed: this safe name is not quoted
    expect(response.headers["content-disposition"]).toBe(
      "attachment; filename=deckgen-1-reseaux-docker.txt",
    );
  });

  it("contains the Anki headers and one line per card in id order", async () => {
    const deck = await insertDeck("Docker", [
      { front: "Le pipe | ?", back: "Ligne 1\nLigne 2" },
      { front: "#1 Quel port ?", back: "80" },
    ]);

    const response = await request(app).get(`/decks/${deck.id}/export`);

    expect(response.text).toBe(
      "#separator:Pipe\n#html:false\n#deck:Docker\nLe pipe / ?|Ligne 1 Ligne 2\n #1 Quel port ?|80\n",
    );
  });

  it("answers 404 for an unknown deck", async () => {
    const response = await request(app).get("/decks/999/export");

    expect(response.status).toBe(404);
  });
});
