# Magnus Accord — production truth checklist (fail-closed)

This checklist is a **truth gate** for any environment claiming to run Magnus Accord dashboard and Autonomous Ops surfaces.

Non-negotiables:
- **No “green” deploy** if DB schema is behind.
- **No “healthy” state** if env validation fails.
- Prefer deterministic, source-linked checks.

## 1) Environment validation (process start)

Each service fails fast at startup if required env vars are missing/invalid via `validateEnv(...)` in `@magnus/config`.

Minimum required env vars (by service) are enforced in:
- `packages/config/src/envValidator.ts`

## 2) Database migration truth (schema shape)

The following services now **fail closed at boot** if the DB schema is missing required tables/columns/enums for Autonomous Ops:
- `apps/org-dashboard-api` (boot-time schema guard)
- `apps/agents` (boot-time schema guard)

The schema guard is implemented in:
- `packages/db/src/schemaGuards.ts` (exported as `@magnus/db/schemaGuards`)

### Deployment preflight (recommended)

Run this in the deploy pipeline (or manually) **after** migrations are applied and **before** marking the release ready:

```bash
pnpm --filter @magnus/db verify:schema
```

This exits non-zero on missing tables/columns/enums that would otherwise cause runtime drift.

## 3) Minimal smoke routes (DB-backed)

After a successful start, confirm these routes return JSON without server errors:
- `@magnus/org-dashboard-api`
  - `GET /health`
  - `GET /api/org/overview` (requires JWT auth; proves DB reads, org scope, and core schema)
  - `GET /api/org/autonomous-ops/control-tower/summary` (requires JWT auth; proves Autonomous Ops tables exist)

## 4) Known non-truth surfaces (do not treat as production truth)

The MCP connector services include explicit demo/stub behavior (seed/mock/random/in-memory) and must not be presented as dashboard truth:
- `apps/mcp-connector/src/services/ComplianceService.ts` (mock state registrations)
- `apps/mcp-connector/src/services/FinancialService.ts` (estimated streams; `Math.random()` monthly data)
- `apps/mcp-connector/src/services/WorkerService.ts` (in-memory org registry)

