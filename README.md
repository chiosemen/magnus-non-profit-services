# Magnus Non Profit Services

AI Infrastructure Platform for Mission-Driven Organizations

Engines:

- MCP Connector
- Grant Proposal Generator
- AI Governance Layer
- Federal Readiness Toolkit

## Magnus Accord scope

Release-facing readiness and exclusions: [`PRODUCTION_READINESS_REPORT.md`](PRODUCTION_READINESS_REPORT.md).  
Route-to-feature mapping: [`docs/ROUTE_FEATURE_MATRIX.md`](docs/ROUTE_FEATURE_MATRIX.md).  
Dashboard waves scope (donor / volunteer / executive — implemented vs excluded): [`docs/DASHBOARD_WAVES_SCOPE.md`](docs/DASHBOARD_WAVES_SCOPE.md).

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
