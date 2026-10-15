import type { Card, Deck, DeckSummary, DeckWithCards, FieldError } from "./types";

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

// For catch blocks: every error becomes an ApiError
export function asApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError(0, "Une erreur inattendue est survenue.");
}

// Message to show for an action that failed (detail of the api, plus field errors for a 422)
export function errorText(error: ApiError): string {
  const fields = error.fieldErrors.map((fieldError) => fieldError.message);
  return fields.length > 0 ? `${error.message} : ${fields.join(" ; ")}` : error.message;
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

  // 204 No Content (DELETE): success without a body to read
  if (response.status === 204) {
    return undefined as T;
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

export function listDecks(): Promise<DeckSummary[]> {
  return request<DeckSummary[]>("GET", "/decks");
}

// id comes straight from the URL: the api answers 422 if it is not a valid id
export function getDeck(id: string): Promise<DeckWithCards> {
  return request<DeckWithCards>("GET", `/decks/${encodeURIComponent(id)}`);
}

export function createDeck(name: string): Promise<Deck> {
  return request<Deck>("POST", "/decks", { name });
}

export function deleteDeck(id: number): Promise<void> {
  return request<void>("DELETE", `/decks/${id}`);
}

export async function generateCards(deckId: number, text: string, count: number): Promise<Card[]> {
  const result = await request<{ cards: Card[] }>("POST", `/decks/${deckId}/generate`, {
    text,
    count,
  });
  return result.cards;
}

export function updateCard(id: number, front: string, back: string): Promise<Card> {
  return request<Card>("PUT", `/cards/${id}`, { front, back });
}

export function deleteCard(id: number): Promise<void> {
  return request<void>("DELETE", `/cards/${id}`);
}

// Plain link target: the browser downloads the file itself (Content-Disposition: attachment)
export function exportUrl(id: number): string {
  return `/api/decks/${id}/export`;
}
