# syntax=docker/dockerfile:1

# deps + build run on the builder's own platform even for a multi-arch image:
# .output is plain JavaScript (no native .node addons), so one native build
# serves every target and only the small runner stage runs per architecture.
# If a native dependency is ever added, drop --platform=$BUILDPLATFORM here.

# ---- deps: install node_modules (scripts skipped; `nuxt build` prepares itself) ----
FROM --platform=$BUILDPLATFORM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ---- build: compile the Nuxt app to .output ----
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runner: minimal runtime image, non-root ----
FROM node:22-alpine AS runner
RUN apk add --no-cache curl
ENV NODE_ENV=production \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000
WORKDIR /app
RUN addgroup -S tick && adduser -S tick -G tick
COPY --from=build --chown=tick:tick /app/.output ./.output
# SQL migrations shipped alongside the server bundle; server/plugins/migrate.ts
# resolves them at <cwd>/server/db/migrations on startup.
COPY --from=build --chown=tick:tick /app/server/db/migrations ./server/db/migrations
USER tick
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/login > /dev/null || exit 1
CMD ["node", ".output/server/index.mjs"]
