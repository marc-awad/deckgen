import { z } from "zod";
import { config } from "../config.js";

// Contract of the generator's POST /generate response
const generateResponse = z.object({
  cards: z
    .array(z.object({ front: z.string().trim().min(1), back: z.string().trim().min(1) }))
    .min(1),
});

export type GeneratedCard = z.infer<typeof generateResponse>["cards"][number];

// Typed errors, translated into HTTP statuses by the route
export class GeneratorUnavailableError extends Error {}
export class GeneratorTimeoutError extends Error {}
export class GeneratorInvalidResponseError extends Error {}

// AbortSignal.timeout() rejects fetch with a DOMException named "TimeoutError"
function isTimeout(err: unknown): boolean {
  return err instanceof DOMException && err.name === "TimeoutError";
}

// fetch hides the network error in err.cause, e.g. { code: "ECONNREFUSED" }
function networkErrorCode(err: unknown): string {
  const cause = err instanceof Error ? err.cause : undefined;
  return typeof cause === "object" && cause !== null && "code" in cause
    ? String(cause.code)
    : "unknown";
}

export async function generateCards(text: string, count: number): Promise<GeneratedCard[]> {
  let response: Response;
  try {
    response = await fetch(`${config.GENERATOR_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, count }),
      signal: AbortSignal.timeout(config.GENERATOR_TIMEOUT_MS),
    });
  } catch (err) {
    if (isTimeout(err)) {
      throw new GeneratorTimeoutError("Generator call timed out", { cause: err });
    }
    // Connection refused, unknown host...
    const code = networkErrorCode(err);
    throw new GeneratorUnavailableError(
      `Cannot reach the generator at ${config.GENERATOR_URL} (${code})`,
      { cause: err },
    );
  }

  if (!response.ok) {
    const message = `Generator answered ${response.status}: ${await response.text()}`;
    if (response.status === 503) throw new GeneratorUnavailableError(message);
    if (response.status === 504) throw new GeneratorTimeoutError(message);
    throw new GeneratorInvalidResponseError(message);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    throw new GeneratorInvalidResponseError("Generator response is not JSON", { cause: err });
  }

  const result = generateResponse.safeParse(body);
  if (!result.success) {
    throw new GeneratorInvalidResponseError(
      `Generator response does not match the contract: ${result.error.message}`,
    );
  }
  return result.data.cards;
}
