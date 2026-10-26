# syntax=docker/dockerfile:1

# ---- Stage 1: all dependencies (TypeScript included) and compilation to dist/ ----
FROM node:24.22.0-alpine3.24 AS build
WORKDIR /app

# Dependencies before the code: npm ci stays cached while the package files are unchanged
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build


# ---- Stage 2: production dependencies only ----
FROM node:24.22.0-alpine3.24 AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
# --omit=optional too: PGlite and @types/pg are dev dependencies but also optional peers
# of drizzle-orm, which --omit=dev alone keeps
RUN npm ci --omit=dev --omit=optional


# ---- Final stage: Node runtime, compiled code, migrations and production dependencies ----
FROM node:24.22.0-alpine3.24

LABEL org.opencontainers.image.title="deckgen-api" \
      org.opencontainers.image.description="deckgen REST API: decks and cards in PostgreSQL, generation and Anki export" \
      org.opencontainers.image.source="https://github.com/marc-awad/deckgen"

# tini as PID 1 forwards signals to node; package managers are useless at runtime
RUN apk add --no-cache tini \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
              /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg

ENV NODE_ENV=production
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Read at startup from dist/db/migrate.js, as ../../drizzle: /app/drizzle
COPY drizzle ./drizzle
COPY package.json ./

# "node" user of the official image; numeric so Kubernetes can check runAsNonRoot
USER 1000:1000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --start-interval=2s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
