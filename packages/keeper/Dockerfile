# syntax=docker/dockerfile:1.6
#
# Build the @tlsn/keeper service for production. Multi-stage so the runtime
# image carries only compiled JS + runtime deps (no devDeps, no tsc).
#
# Build context is expected to be the monorepo root so that workspace links
# to @tlsn/common can resolve. Example:
#
#   docker build -f packages/keeper/Dockerfile -t tlsn-keeper .
#
# (`docker-compose.yml` sets the right context automatically.)

# ─── Stage 1: build ────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS build
WORKDIR /repo

# Copy only what's needed to install + build. Bringing the full monorepo would
# explode the build cache on unrelated edits.
COPY package.json package-lock.json ./
COPY packages/common/package.json packages/common/
COPY packages/keeper/package.json packages/keeper/

# Install with workspace symlinks (omit other workspaces to stay lean).
RUN npm install --workspace=@tlsn/common --workspace=@tlsn/keeper --include-workspace-root

# Now bring source + compile both packages.
COPY packages/common ./packages/common
COPY packages/keeper ./packages/keeper
RUN npm run build --workspace=@tlsn/common \
 && npm run build --workspace=@tlsn/keeper

# ─── Stage 2: runtime ──────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy only production artifacts: built JS, package manifests, and node_modules.
COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/common/package.json ./packages/common/package.json
COPY --from=build /repo/packages/common/dist ./packages/common/dist
COPY --from=build /repo/packages/keeper/package.json ./packages/keeper/package.json
COPY --from=build /repo/packages/keeper/dist ./packages/keeper/dist

WORKDIR /app/packages/keeper
RUN mkdir -p /app/packages/keeper/data
# Health endpoint default — override with HEALTH_PORT env if needed.
EXPOSE 9091

CMD ["node", "dist/index.js"]
