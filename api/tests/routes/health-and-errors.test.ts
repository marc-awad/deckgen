import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { useTestDatabase } from "../helpers/test-db.js";

vi.mock("../../src/db/client.js", () => import("../helpers/test-db.js"));
useTestDatabase();

const app = createApp();

describe("probes", () => {
  it("GET /health answers ok", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("GET /ready answers ready when the database responds", async () => {
    const response = await request(app).get("/ready");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ready" });
  });
});

describe("request errors", () => {
  it("answers 404 for an unknown route", async () => {
    const response = await request(app).get("/unknown");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ detail: "Route introuvable" });
  });

  it("answers 400 for a malformed JSON body", async () => {
    const response = await request(app)
      .post("/decks")
      .set("Content-Type", "application/json")
      .send('{"name": "Docker",}');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ detail: "Corps de requête JSON invalide" });
  });

  it("answers 413 for a body over 100 kb", async () => {
    const response = await request(app)
      .post("/decks")
      .send({ name: "x".repeat(110_000) });

    expect(response.status).toBe(413);
    expect(response.body).toEqual({ detail: "Corps de requête trop volumineux" });
  });

  it.each(["abc", "0", "1.5", "99999999999"])("answers 422 for the invalid id %s", async (id) => {
    const response = await request(app).get(`/decks/${id}`);

    expect(response.status).toBe(422);
    expect(response.body.detail).toBe("Données invalides");
    expect(response.body.errors[0].field).toBe("id");
  });
});
