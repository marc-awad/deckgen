import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores(["dist/"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // Allow unused parameters prefixed with "_" (e.g. Express error handler signature)
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
