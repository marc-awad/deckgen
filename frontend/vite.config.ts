import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";

// Local only: in production, nginx serves the app and forwards /api to the api
const apiProxy: Record<string, ProxyOptions> = {
  "/api": {
    target: process.env.API_PROXY_TARGET || "http://localhost:3000",
    changeOrigin: true,
    // /api/decks becomes /decks
    rewrite: (path) => path.replace(/^\/api/, ""),
    // A generation can take several minutes
    timeout: 300_000,
    proxyTimeout: 300_000,
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
});
