# CRM Llamadas — API (Express + Prisma)
# Build: docker compose build api
FROM node:20-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci --include=dev

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma/
# prisma CLI is a devDependency but needed for migrate deploy at start
RUN npm ci --omit=dev \
  && npm install prisma@5.22.0 --no-save \
  && npx prisma generate

COPY --from=build /app/dist ./dist
COPY scripts ./scripts

RUN mkdir -p uploads/imports \
  && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1

# Migrate then start (same pattern as Render startCommand)
CMD ["bash", "-c", "bash scripts/migrate-deploy-prod.sh && node dist/index.js"]
