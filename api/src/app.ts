import express, { type NextFunction, type Request, type Response } from "express";
import { logger } from "./logger.js";
import { healthRouter } from "./routes/health.js";

export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");

  app.use(healthRouter);

  // No route matched
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ detail: "Route introuvable" });
  });

  // Unexpected error: full details in the logs, generic message for the client
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, "Unhandled error");
    res.status(500).json({ detail: "Erreur interne du serveur" });
  });

  return app;
}
