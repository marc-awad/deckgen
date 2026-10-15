import { defineConfig } from "drizzle-kit";

// Used by drizzle-kit only, to generate SQL migrations from the schema
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
