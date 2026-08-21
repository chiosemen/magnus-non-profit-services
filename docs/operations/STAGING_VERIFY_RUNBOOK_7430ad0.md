# Staging verify runbook — post-`7430ad0` (operator)

**Target SHA:** `7430ad0` (green CI)  
**Services:** `accord-web-staging` · `accord-postgres-staging` · Railway project *MAGNUS NON PROFIT SERVICES* · environment **`staging`**  
**Domain:** `https://staging.magnusnonprofitservices.com`

**Hard rules**
- Never `echo` / `env` / `printenv` / `cat` secrets. `$DATABASE_URL` is referenced inside the Railway Console only — never expanded into chat.
- Check status.railway.com before assuming a deploy failure is a code problem.
- **Do not** create `docs/releases/p0-staging-verified.md` until Check 4 is green. That file is a D2 gate input for `activate-org`, not documentation.
- Evidence pastes go in `docs/releases/<sha>.md` (from the template). The gate file is a **separate deliberate commit** after Check 4.

---

## Corrected operator sequence (verbatim)

```bash
# ── Step 2 · Baseline. Run in the accord-postgres-staging CONSOLE. ──
psql "$DATABASE_URL" -c 'SELECT (SELECT count(*) FROM "Organization") AS orgs, (SELECT count(*) FROM "Worker") AS workers, (SELECT count(*) FROM "Donor") AS donors;'
psql "$DATABASE_URL" -c 'SELECT "subscriptionStatus", count(*) FROM "Organization" GROUP BY 1 ORDER BY 1;'

# ── Step 3 · Deploy 7430ad0 to accord-web-staging (operator-authorised). ──

# ── Step 4 · Migrations. Run in the accord-web-staging CONSOLE, not Postgres.
#    The Postgres container has no repo checkout, and hand-applied SQL does not
#    register in _prisma_migrations, which leaves Prisma unable to trust the DB.
pnpm --filter @magnus/db prisma:deploy

# ── Step 4b · Prove it took effect (Postgres console) ──
psql "$DATABASE_URL" -c "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 4;"
psql "$DATABASE_URL" -c "SELECT column_default FROM information_schema.columns WHERE table_name='Organization' AND column_name='subscriptionStatus';"

# ── Step 5 · Check 4. THE PAGE-LESS ROUTE. Not /app. ──
curl -i -s https://staging.magnusnonprofitservices.com/app/__middleware_probe_no_page | head -n 5
#   307/308 → /login  = middleware live. Only this lifts D2.
#   404               = fix not deployed. STOP.

# Optional, label honestly — this is Check 3 and proves nothing about middleware:
curl -i -s https://staging.magnusnonprofitservices.com/app | head -n 5
```

### Why these two corrections matter

1. **`prisma:deploy` from `accord-web-staging`**, not `psql -f` from Postgres — records `_prisma_migrations`, applies the enum split in filename order, avoids drift.
2. **Check 4 = `/app/__middleware_probe_no_page`**, not `/app` — a 307 on `/app` is Check 3 (page guard) and would lift D2 on a vacuous gate.

### Expected 4b results

- Migration names present (at least the three `2026082014*` / `2026082018*` rows).
- Column default: `'PENDING'::"SubscriptionStatus"` (or equivalent).

### PENDING default vs existing rows

`ALTER COLUMN … SET DEFAULT 'PENDING'` affects **new inserts only**. Pre-existing orgs keep their prior status (likely `ACTIVE`). If baseline counts are non-zero and any are unpaid, use audited `deactivateOrg` — do not claim the migration de-entitled them.

### After green Check 4 only

1. Fill `docs/releases/7430ad0.md` (or post-deploy SHA) from `TEMPLATE_READY_FOR_STAGING_PILOT.md` with **pasted** outputs.  
2. **Separate commit:** create `docs/releases/p0-staging-verified.md` stating Check 4 green + evidence pointer. That is what lifts D2.

### Do not

- Query `BillingAuditEntry` before Step 4 (table does not exist yet).  
- Query `User` (table is `Worker`).  
- Paste connection strings into any agent chat.  
- Treat Check 3 as middleware evidence.
