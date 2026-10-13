import express, { type Request, type Response } from "express";
import { errorHandler } from "./errors.js";
import { cardsRouter } from "./routes/cards.js";
import { decksRouter } from "./routes/decks.js";
import { healthRouter } from "./routes/health.js";

export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");

  // Parse JSON bodies, refuse bodies over 100 kb (a 20 000 character course fits easily)
  app.use(express.json({ limit: "100kb" }));

  app.use(healthRouter);
  app.use(decksRouter);
  app.use(cardsRouter);

  // No route matched
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ detail: "Route introuvable" });
  });

  // Must be registered last: Express recognizes it by its 4 parameters
  app.use(errorHandler);

  return app;
}
