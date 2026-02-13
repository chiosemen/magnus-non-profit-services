# Magnus MCP Connector — Production Dockerfile
# Multi-stage build: build → production

# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (including dev for build)
RUN npm ci

# Copy source
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# ─── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production

# Security: run as non-root
RUN addgroup -g 1001 -S magnus && \
    adduser  -u 1001 -S magnus -G magnus

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ONLY production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Create logs directory
RUN mkdir -p ./logs && chown magnus:magnus ./logs

# Switch to non-root user
USER magnus

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3001}/health || exit 1

# Default port
EXPOSE 3001

# Environment
ENV NODE_ENV=production \
    PORT=3001 \
    MCP_TRANSPORT=sse

# Start server
CMD ["node", "dist/server.js"]
