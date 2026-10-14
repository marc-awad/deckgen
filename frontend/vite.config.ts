import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type ProxyOptions } from "vite";

// Version of the build, given by the Dockerfile (ARG APP_VERSION); "dev" otherwise
const appVersion = process.env.VITE_APP_VERSION || "dev";

// Writes dist/version.json and a <meta name="app-version"> tag in index.html,
// so that the deployed version can be checked with curl
function versionInfo(): Plugin {
  return {
    name: "deckgen-version",
    transformIndexHtml: () => [
      { tag: "meta", attrs: { name: "app-version", content: appVersion }, injectTo: "head" },
    ],
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: `${JSON.stringify({ version: appVersion })}\n`,
      });
    },
  };
}

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
  plugins: [react(), tailwindcss(), versionInfo()],
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
});
