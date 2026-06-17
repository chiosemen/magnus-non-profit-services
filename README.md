# Magnus Non Profit Services

AI Infrastructure Platform for Mission-Driven Organizations

## Current Release Truth

As of 2026-06-11, Magnus Accord is in **Pilot/Staging Verification: In Progress**.

**Production Certification: Not Yet Approved.** Known P0 blockers remain before GA or broad production use. Private pilot use must be gated by the current hardening checklist in [BLOCKERS_TO_PRODUCTION.md](BLOCKERS_TO_PRODUCTION.md) and [docs/operations/P0_PRODUCTION_HARDENING_BASELINE.md](docs/operations/P0_PRODUCTION_HARDENING_BASELINE.md).

Feature status is tracked as **Live / Pilot / Gated / Scaffolded / Deferred** in [docs/product/MAGNUS_ACCORD_FEATURE_DIRECTORY.md](docs/product/MAGNUS_ACCORD_FEATURE_DIRECTORY.md). Mobile is web-responsive only; no native mobile app is shipped. MCP is internal/operator-only. Worker-financial capabilities are deferred/scaffolded. Grant drafting is an internal AI Concierge capability first, not a standalone public app.

Internal engines:

- MCP Connector (operator-only)
- Grant Proposal Generator (AI Concierge-backed)
- AI Governance Layer
- Federal Readiness Toolkit

## Autonomous Ops

Bounded agent program (stages, autonomy tiers, persona mapping): [`docs/AUTONOMOUS_OPS_ROADMAP.md`](docs/AUTONOMOUS_OPS_ROADMAP.md). Handoff and org identity storage: [`docs/AUTONOMOUS_OPS_HANDOFF_AND_MEMORY.md`](docs/AUTONOMOUS_OPS_HANDOFF_AND_MEMORY.md).

**Magnus Accord — client-readable framing:** [`docs/product/MAGNUS_ACCORD_PRODUCT_POSITIONING.md`](docs/product/MAGNUS_ACCORD_PRODUCT_POSITIONING.md) · [`docs/product/MAGNUS_ACCORD_MATURITY_MAP.md`](docs/product/MAGNUS_ACCORD_MATURITY_MAP.md).

**Pilot launch (canonical):** [`docs/product/MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md`](docs/product/MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md) · [`docs/product/MAGNUS_ACCORD_FEATURE_DIRECTORY.md`](docs/product/MAGNUS_ACCORD_FEATURE_DIRECTORY.md) · [`docs/product/MAGNUS_ACCORD_CONNECTOR_REGISTRY.md`](docs/product/MAGNUS_ACCORD_CONNECTOR_REGISTRY.md) (code: `connectorRegistry.ts`) · [`docs/product/MAGNUS_ACCORD_ACTION_MATRIX.md`](docs/product/MAGNUS_ACCORD_ACTION_MATRIX.md) (code: `accordActionMatrix.ts`).

## Setup

PR hardening checklist: `docs/PR_CHECKLIST.md`

```bash
# 1. Copy env template
cp .env.template .env   # (root level — if applicable)
cp apps/grant-generator/.env.template apps/grant-generator/.env
cp apps/mcp-connector/.env.template apps/mcp-connector/.env

# 2. Fill in all values in each .env file

# 3. Install dependencies
pnpm install

# 4. Generate Prisma client
pnpm prisma:generate

# 5. Run in development
pnpm -r dev --if-present
```
