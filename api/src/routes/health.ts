import { Router } from "express";
import { pingDatabase } from "../db/client.js";
import { logger } from "../logger.js";

export const healthRouter = Router();

// Liveness probe: the process answers, the database is not checked
healthRouter.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Readiness probe: the service can handle traffic only if the database answers
healthRouter.get("/ready", async (_req, res) => {
  try {
    await pingDatabase();
    res.json({ status: "ready" });
  } catch (err) {
    logger.warn({ err }, "Database is not reachable");
    res.status(503).json({ status: "unavailable" });
  }
});
