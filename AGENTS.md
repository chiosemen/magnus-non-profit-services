# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Magnus Non Profit Services is a pnpm monorepo (pnpm 10.29.3, Node >= 20). It consists of 4 shared packages (`packages/`) and 7+ applications (`apps/`). See `README.md` for the standard setup steps (`pnpm install`, `pnpm prisma:generate`, etc.).

### Environment files

The repo-root `.env` provides shared vars (`DATABASE_URL`, `JWT_SECRET`). Some apps also need a local `.env`:

- `packages/db/.env` — must have `DATABASE_URL` (needed by the Prisma CLI wrapper at `packages/db/scripts/prisma.cjs`)
- `apps/web/.env.local` — must have `DATABASE_URL` and `JWT_SECRET` (Next.js loads `.env.local` automatically; `@magnus/config` envValidator is not used by the web app)
- `apps/mcp-connector/.env` — copy from `.env.template`
- `apps/grant-generator/.env` — copy from `.env.template`

### PostgreSQL

All services depend on PostgreSQL. Default dev connection: `postgresql://postgres:postgres@localhost:5432/magnus?schema=public`. Start Postgres with `sudo pg_ctlcluster <version> main start` and ensure the `magnus` database exists.

### Build order matters

Shared packages must be built before apps. `pnpm build` (from root) handles the correct order via workspace dependency graph. Always run `pnpm prisma:generate` before `pnpm build`.

### Running tests

`pnpm -r --if-present test` runs all tests but may fail on `@magnus/auth` because `node --test dist/tests` doesn't glob `.js` files on all Node versions. To run tests reliably, use explicit file paths: `node --test dist/tests/*.test.js` within each package/app directory after building.

### Linting

The `mcp-connector` app has a `lint` script (`eslint src/**/*.ts --fix`) but no `eslint.config.*` file exists, so it fails. Other packages have no lint scripts. TypeScript type-checking across all projects: `pnpm -r exec tsc --noEmit`.

### Service ports

| Service | Port |
|---|---|
| `@magnus/web` (Next.js) | 3000 |
| `@magnus/mcp-connector` | 3001 |
| `@magnus/grant-generator` | 3002 |
| `@magnus/org-dashboard-api` | 4010 |
| `@magnus/claude-partner` | 4020 |
| `@magnus/worker-financial-layer` | 4030 |
| `@magnus/billing` | 4040 |

### Services requiring external API keys

- **billing**: `STRIPE_SECRET_KEY` (starts without a real key but Stripe calls will fail)
- **claude-partner**: `ANTHROPIC_API_KEY` (env validation will throw without it)
- **grant-generator**: `ANTHROPIC_API_KEY`

Services that only need `DATABASE_URL` + `JWT_SECRET` to start: `web`, `mcp-connector`, `org-dashboard-api`, `worker-financial-layer`. The `agents` app only needs `DATABASE_URL`.

### Dev startup

Start all services with `pnpm -r dev --if-present`, or start individual services with `pnpm --filter @magnus/<name> dev`. All backend Express apps use `ts-node-dev --respawn` for hot reloading. The web app uses `next dev`.

### Health checks

All services expose `GET /health` returning `{"ok":true}`. The web app uses `GET /api/health`.
