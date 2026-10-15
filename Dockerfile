# ============================================================
# Builder
# ============================================================

FROM node:22-slim AS builder

WORKDIR /app

ENV NODE_ENV=development
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable \
    && corepack prepare pnpm@10.26.0 --activate

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        make \
        g++ \
        openssl \
    && rm -rf /var/lib/apt/lists/*

# ------------------------------------------------------------
# Dependencies
# ------------------------------------------------------------

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

# ------------------------------------------------------------
# Prisma
# ------------------------------------------------------------

COPY prisma ./prisma

RUN pnpm exec prisma generate

# ------------------------------------------------------------
# Application
# ------------------------------------------------------------

COPY . .

RUN pnpm build


# ============================================================
# Production
# ============================================================

FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable \
    && corepack prepare pnpm@10.26.0 --activate

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        openssl \
    && rm -rf /var/lib/apt/lists/*

# ------------------------------------------------------------
# Application user
# ------------------------------------------------------------

RUN groupadd --gid 1001 appgroup \
    && useradd \
        --uid 1001 \
        --gid appgroup \
        --shell /usr/sbin/nologin \
        --create-home \
        appuser

# ------------------------------------------------------------
# Production dependencies
#
# IMPORTANT:
# "prisma": "6.17.1" must be in dependencies,
# not devDependencies.
# ------------------------------------------------------------

COPY package.json pnpm-lock.yaml ./

RUN pnpm install \
        --frozen-lockfile \
        --prod \
    && pnpm store prune

# ------------------------------------------------------------
# Prisma schema
# ------------------------------------------------------------

COPY --chown=appuser:appgroup prisma ./prisma

# Generate Prisma Client using the production-installed CLI.
# This avoids pnpm dlx downloading another Prisma version.
RUN pnpm exec prisma generate

# ------------------------------------------------------------
# Application build
# ------------------------------------------------------------

COPY --from=builder \
    --chown=appuser:appgroup \
    /app/dist ./dist

COPY --chown=appuser:appgroup \
    ecosystem.config.js ./

# ------------------------------------------------------------
# Runtime
# ------------------------------------------------------------

USER appuser

EXPOSE 3000

HEALTHCHECK \
    --interval=30s \
    --timeout=5s \
    --start-period=15s \
    --retries=3 \
    CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["./node_modules/.bin/pm2-runtime", "start", "ecosystem.config.js"]