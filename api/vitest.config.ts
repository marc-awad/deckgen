import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Every variable read by config.ts, so the tests never depend on api/.env.
    // ".invalid" hosts can never be resolved (RFC 2606): no real service is reachable.
    env: {
      PORT: "3000",
      DB_HOST: "postgres.invalid",
      DB_PORT: "5432",
      POSTGRES_USER: "test",
      POSTGRES_PASSWORD: "test",
      POSTGRES_DB: "test",
      LOG_LEVEL: "silent",
      GENERATOR_URL: "http://generator.invalid:8000",
      GENERATOR_TIMEOUT_MS: "1000",
    },
    // Starting PGlite and applying the migrations takes a few seconds
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Entry point and real database connection: replaced by PGlite in the tests
      exclude: ["src/index.ts", "src/db/client.ts", "src/db/migrate.ts"],
      reporter: ["text"],
    },
  },
});
