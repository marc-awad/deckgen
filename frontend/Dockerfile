# syntax=docker/dockerfile:1

# ---- Build stage: compile the React app into static files (dist/) ----
FROM node:24.21.0-alpine3.24 AS build
WORKDIR /app

# Dependencies before the code: npm ci stays cached while the package files are unchanged
COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY public ./public
COPY src ./src
RUN npm run build


# ---- Final stage: nginx serves the static files and forwards /api to the api ----
FROM nginxinc/nginx-unprivileged:1.30.5-alpine3.24

LABEL org.opencontainers.image.title="deckgen-frontend" \
      org.opencontainers.image.description="deckgen web interface served by nginx, with /api forwarded to the api" \
      org.opencontainers.image.source="https://github.com/marc-awad/deckgen"

# Api address used by the nginx template; NGINX_ENTRYPOINT_LOCAL_RESOLVERS makes the
# image read the container DNS servers into NGINX_LOCAL_RESOLVERS at startup
ENV API_UPSTREAM=api:3000 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

# Templates of /etc/nginx/templates are turned into /etc/nginx/conf.d/*.conf at startup
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# nginx user (uid 101) of the unprivileged image, which listens on 8080 instead of 80
USER 101

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --start-interval=2s --retries=3 \
    CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/health"]

CMD ["nginx", "-g", "daemon off;"]
