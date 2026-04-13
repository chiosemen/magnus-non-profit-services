# Deployment and Container Hardening Summary

This document summarizes the operational hardening measures implemented for the Magnus Accord production-grade posture.

## 1. Container Security & Hygiene

### mcp-connector
- **Pinned Image Provenance**: Switched from generic `node:20-alpine` to a specific, immutable version: `node:20.12.2-alpine3.18`.
- **Monorepo Build Patterns**: Dockerfile now correctly handles pnpm workspace dependencies (`@magnus/config`, `@magnus/db`) by using a root-based build context.
- **Multi-Stage Build**: Separates build-time secrets and devDependencies from the final production layer.
- **Non-Root Execution**: Container runs as the `magnus` user (UID 1001), mitigating potential container escape impacts.
- **Production Optimization**: `pnpm install --prod` is used in the final stage to keep the image slim and reduce the attack surface.
- **Runtime Health**: Added explicit `HEALTHCHECK` instructions to monitor the SSE transport availability.

## 2. Context Safety (.dockerignore)

The global `.dockerignore` has been hardened to prevent accidental leakage of local artifacts into build contexts:
- **Strict Secret Blocking**: Explicitly ignores `.env*` (except `.env.template`), `*.pem`, `*.key`, `*.cert`, and `credentials.json`.
- **Infrastructure Isolation**: Excludes `.git`, `.github`, and `.vscode` to minimize image metadata.
- **Dependency Hygiene**: Ensures local `node_modules` and build caches (`.turbo`, `.next`) are never copied, enforcing clean builds inside the container.

## 3. CI/CD Validation

- **Incremental Docker Verification**: Fixed the CI pipeline to verify image builds for `mcp-connector` on every Pull Request.
- **Additive Migrations**: Maintained the `scripts/validate-migrations.js` check to prevent destructive DB changes in delivery pipelines.

## 4. Production Environment Checklist

Before deploying, ensure the following critical environment variables are provisioned:

| Variable | Scope | Purpose |
| :--- | :--- | :--- |
| `DATABASE_URL` | Global | PostgreSQL connection string |
| `REDIS_URL` | Global | Shared state for cross-instance rate limiting |
| `ENCRYPTION_KEY` | DB / MCP | 64-character hex key for field encryption |
| `JWT_SECRET` | Auth / MCP | Secure secret for token signing/verification |
| `SENTRY_DSN` | Global | Production error tracking |
| `NODE_ENV` | Global | Set to `production` |

## 5. Operations Best Practices
- **Never Mount Secrets as Files**: Use environment variables or a secure secret manager (e.g., Railway Secrets, Vault).
- **Scale with Redis**: Redis is mandatory for production rate-limiting consistency across multiple container instances.
