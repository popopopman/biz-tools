# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22-alpine

# ---- base: node + pnpm (via corepack), shared by every later stage ----
FROM node:${NODE_VERSION} AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"
WORKDIR /app

# ---- deps: install dependencies with a cached pnpm store ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

# ---- dev: hot-reload dev server (used by `docker compose up dev`) ----
FROM deps AS dev
COPY . .
EXPOSE 3000
CMD ["pnpm", "dev"]

# ---- builder: static export used both for CI and local preview ----
FROM deps AS builder
COPY . .
ARG GITHUB_PAGES=false
ARG NEXT_PUBLIC_ADSENSE_CLIENT=""
ENV GITHUB_PAGES=${GITHUB_PAGES} \
    NEXT_PUBLIC_ADSENSE_CLIENT=${NEXT_PUBLIC_ADSENSE_CLIENT}
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm build

# ---- preview: serve the static export with nginx ----
FROM nginx:alpine AS preview
COPY --from=builder /app/out /usr/share/nginx/html
EXPOSE 80
