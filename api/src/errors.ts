import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { logger } from "./logger.js";

// Validation messages returned to clients are in French
z.config(z.locales.fr());

// Expected error: routes throw it, the error handler answers {"detail": message}
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// express.json() errors carry a "type" such as "entity.parse.failed" or "entity.too.large"
function bodyParserErrorType(err: unknown): unknown {
  return typeof err === "object" && err !== null && "type" in err ? err.type : undefined;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ detail: err.message });
    return;
  }

  // Thrown by schema.parse() in the routes
  if (err instanceof z.ZodError) {
    const errors = err.issues.map((issue) => ({
      field: issue.path.join(".") || "body",
      message: issue.message,
    }));
    res.status(422).json({ detail: "Données invalides", errors });
    return;
  }

  const type = bodyParserErrorType(err);
  if (type === "entity.parse.failed") {
    res.status(400).json({ detail: "Corps de requête JSON invalide" });
    return;
  }
  if (type === "entity.too.large") {
    res.status(413).json({ detail: "Corps de requête trop volumineux" });
    return;
  }

  // Unexpected error: full details in the logs, generic message for the client
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ detail: "Erreur interne du serveur" });
}
