import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// api/.env, only present in local development (variables already set in the environment win)
const envFile = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const port = z.coerce.number().int().min(1).max(65535);

const envSchema = z.object({
  PORT: port.default(3000),
  DB_HOST: z.string().min(1),
  DB_PORT: port.default(5432),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_DB: z.string().min(1),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  // Trailing slashes removed so that `${GENERATOR_URL}/generate` is always a valid URL
  GENERATOR_URL: z.url({ protocol: /^https?$/ }).transform((url) => url.replace(/\/+$/, "")),
  // Longer than the generator's own limit (2 attempts of 120 s)
  GENERATOR_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    // The logger is not available yet: its level comes from this configuration
    console.error(`Invalid or missing environment variables: ${names.join(", ")}`);
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
