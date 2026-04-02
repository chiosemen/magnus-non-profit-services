#!/usr/bin/env bash
# Magnus Accord pilot — schema preflight only.
# Requires: DATABASE_URL (and Prisma client) pointing at the target DB with migrations applied.
# Exit 0 on success; non-zero if schema does not match MAGNUS_ACCORD_AUTONOMOUS_OPS_SHAPE.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec pnpm --filter @magnus/db verify:schema
