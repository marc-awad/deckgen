import type { Card, Deck, FieldError } from "./types";

const NETWORK_ERROR = "Impossible de joindre le serveur. Réessayez dans un instant.";

// Error returned by the api; status 0 means the api could not be reached
export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors: FieldError[];

  constructor(status: number, message: string, fieldErrors: FieldError[] = []) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFieldError(value: unknown): value is FieldError {
  return isRecord(value) && typeof value.field === "string" && typeof value.message === "string";
}

// Reads {"detail": "..."} and, for 422 responses, {"errors": [{field, message}]}
function toApiError(status: number, body: unknown): ApiError {
  const detail = isRecord(body) && typeof body.detail === "string" ? body.detail : "Erreur inconnue";
  const fieldErrors = isRecord(body) && Array.isArray(body.errors) ? body.errors.filter(isFieldError) : [];
  return new ApiError(status, detail, fieldErrors);
}

// Relative /api path: the Vite proxy (dev) or nginx (prod) forwards it to the api
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, NETWORK_ERROR);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    // Not JSON: the proxy answered instead of the api (api stopped, gateway error...)
    throw new ApiError(0, NETWORK_ERROR);
  }

  if (!response.ok) {
    throw toApiError(response.status, data);
  }
  return data as T;
}

export function createDeck(name: string): Promise<Deck> {
  return request<Deck>("POST", "/decks", { name });
}

export async function generateCards(deckId: number, text: string, count: number): Promise<Card[]> {
  const result = await request<{ cards: Card[] }>("POST", `/decks/${deckId}/generate`, {
    text,
    count,
  });
  return result.cards;
}
