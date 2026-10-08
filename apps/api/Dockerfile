# syntax=docker/dockerfile:1
# ── API Filitech — Cap. 3.1 (multi-stage; distroless no runtime) ─────────────
# Build (na raiz do monorepo):
#   docker build -f apps/api/Dockerfile -t filitech-api .
# Obs.: monte as chaves JWT e injete DATABASE_URL/REDIS_URL em runtime
# (o .env NÃO é copiado de propósito — 12-factor).

# ── Builder ─────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# Camada de dependências (cache de builds)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @filitech/api...

# Código + geração do Prisma Client + build TypeScript
COPY packages ./packages
COPY apps/api ./apps/api
ENV DATABASE_URL=postgresql://placeholder:5432/placeholder
RUN pnpm --filter @filitech/db db:generate \
 && pnpm --filter @filitech/api build \
 && pnpm prune --prod --filter @filitech/api

# ── Runtime (distroless, Cap. 3.1) ──────────────────────────────────────────
FROM gcr.io/distroless/nodejs20-debian12 AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Symlinks do pnpm são relativos dentro de /app — copiar todo o workspace
# preserva a árvore node_modules/.pnpm funcionando.
COPY --from=builder /app /app
EXPOSE 3001
USER nonroot
CMD ["apps/api/dist/main.js"]
