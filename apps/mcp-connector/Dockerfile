# Magnus MCP Connector — Production Dockerfile
# Optimized for pnpm monorepo structure

# ─── Stage 1: Base ───────────────────────────────────────────────────────────
FROM node:20.12.2-alpine3.18 AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# ─── Stage 2: Builder ─────────────────────────────────────────────────────────
FROM base AS builder

# Copy workspace configuration and lockfile
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy the specific app and its workspace dependencies
COPY apps/mcp-connector ./apps/mcp-connector
COPY packages/config ./packages/config
COPY packages/db ./packages/db

# Install dependencies (including workspace dependencies)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Build the app (and its workspace dependencies if needed)
RUN pnpm --filter @magnus/mcp-connector build

# ─── Stage 3: Production ──────────────────────────────────────────────────────
FROM base AS production

# Security: run as non-root
RUN addgroup -g 1001 -S magnus && \
    adduser  -u 1001 -S magnus -G magnus

WORKDIR /app

# Copy production artifacts from builder
COPY --from=builder /app/apps/mcp-connector/package.json ./apps/mcp-connector/
COPY --from=builder /app/apps/mcp-connector/dist ./apps/mcp-connector/dist
COPY --from=builder /app/package.json ./pnpm-lock.yaml ./pnpm-workspace.yaml ./
COPY --from=builder /app/packages/config ./packages/config
COPY --from=builder /app/packages/db ./packages/db

# Install ONLY production dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

# Create logs directory
RUN mkdir -p /app/apps/mcp-connector/logs && chown -R magnus:magnus /app

# Switch to non-root user
USER magnus

# Environment
ENV NODE_ENV=production \
    PORT=3001 \
    MCP_TRANSPORT=sse

# Health check (targets the app port)
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

# Default port
EXPOSE 3001

# Start server from the app directory
WORKDIR /app/apps/mcp-connector
CMD ["node", "dist/server.js"]
