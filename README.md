# Magnus Non Profit Services

AI Infrastructure Platform for Mission-Driven Organizations

Engines:

- MCP Connector
- Grant Proposal Generator
- AI Governance Layer
- Federal Readiness Toolkit

## Autonomous Ops

Bounded agent program (stages, autonomy tiers, persona mapping): [`docs/AUTONOMOUS_OPS_ROADMAP.md`](docs/AUTONOMOUS_OPS_ROADMAP.md). Handoff and org identity storage: [`docs/AUTONOMOUS_OPS_HANDOFF_AND_MEMORY.md`](docs/AUTONOMOUS_OPS_HANDOFF_AND_MEMORY.md).

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
