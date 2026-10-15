import { z } from "zod";

// Largest value of a PostgreSQL integer column: bigger ids would make the query fail
const MAX_ID = 2_147_483_647;

export const idParams = z.object({
  id: z.coerce.number().int().positive().max(MAX_ID),
});

export const deckBody = z.object({
  name: z.string().trim().min(1).max(100),
});

export const cardBody = z.object({
  front: z.string().trim().min(1).max(500),
  back: z.string().trim().min(1).max(500),
});

// Same rules as GenerateRequest in the generator, to avoid calling it for nothing
export const generateBody = z.object({
  text: z.string().trim().min(50).max(20_000),
  count: z.number().int().min(1).max(30).default(5),
});
