import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GeneratorInvalidResponseError,
  GeneratorTimeoutError,
  GeneratorUnavailableError,
  generateCards,
} from "../src/services/generator-client.js";

// The real fetch is replaced: no request ever leaves the test
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const TEXT = "x".repeat(60);

describe("generateCards", () => {
  it("returns the cards of a valid response", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { cards: [{ front: "Q ?", back: "R." }] }));

    await expect(generateCards(TEXT, 5)).resolves.toEqual([{ front: "Q ?", back: "R." }]);
  });

  it("posts text and count as JSON to GENERATOR_URL/generate with a timeout signal", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { cards: [{ front: "Q ?", back: "R." }] }));

    await generateCards(TEXT, 5);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://generator.invalid:8000/generate");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ text: TEXT, count: 5 });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("throws GeneratorUnavailableError when the generator cannot be reached", async () => {
    // What fetch throws for a refused connection
    fetchMock.mockRejectedValue(new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } }));

    await expect(generateCards(TEXT, 5)).rejects.toThrow(GeneratorUnavailableError);
  });

  it("puts the network error code in the error message for the logs", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } }));

    await expect(generateCards(TEXT, 5)).rejects.toThrow(/ENOTFOUND/);
  });

  it("throws GeneratorTimeoutError when the timeout signal aborts the request", async () => {
    // What fetch throws when AbortSignal.timeout() fires: simulated, no real waiting
    fetchMock.mockRejectedValue(new DOMException("The operation timed out", "TimeoutError"));

    await expect(generateCards(TEXT, 5)).rejects.toThrow(GeneratorTimeoutError);
  });

  it.each([
    { status: 503, error: GeneratorUnavailableError },
    { status: 504, error: GeneratorTimeoutError },
    { status: 502, error: GeneratorInvalidResponseError },
    { status: 500, error: GeneratorInvalidResponseError },
    { status: 422, error: GeneratorInvalidResponseError },
  ])("throws $error.name when the generator answers $status", async ({ status, error }) => {
    fetchMock.mockResolvedValue(jsonResponse(status, { detail: "Erreur" }));

    await expect(generateCards(TEXT, 5)).rejects.toThrow(error);
  });

  it("throws GeneratorInvalidResponseError for a body that is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("pas du JSON", { status: 200 }));

    await expect(generateCards(TEXT, 5)).rejects.toThrow(GeneratorInvalidResponseError);
  });

  it("throws GeneratorInvalidResponseError for a card without back", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { cards: [{ front: "Q ?" }] }));

    await expect(generateCards(TEXT, 5)).rejects.toThrow(GeneratorInvalidResponseError);
  });

  it("throws GeneratorInvalidResponseError for an empty list of cards", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { cards: [] }));

    await expect(generateCards(TEXT, 5)).rejects.toThrow(GeneratorInvalidResponseError);
  });
});
