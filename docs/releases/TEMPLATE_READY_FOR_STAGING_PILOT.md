# Release Record — \<SHA\>

**Repository:** `chiosemen/magnus-non-profit-services`  
**Date:** \<YYYY-MM-DD\>  
**Rollback owner:** @chinyeosemene  
**Decision:** `READY_FOR_STAGING_PILOT` — *not* production-ready

> This record supersedes `BLOCKERS_TO_PRODUCTION.md` for this SHA. It is the sole source of
> approval status. Every claim below links to a machine-produced artifact or says plainly that it
> was not run. **Do not paste summaries — paste actual command output.**
>
> **Fill rules:** replace every `\<…\>` and every `<PASTE>` with measured evidence. Do **not**
> create `docs/releases/p0-staging-verified.md` from this template alone — that file is a D2 gate
> input for `activate-org` and may be created **only after a green Check 4**.

---

## 1. What shipped

| PR | Contents |
|---|---|
| #18 | `docs/SPEC-P0.md`, `.cursor/rules/accord-p0.mdc`, security policy amendment, R12 PR checkbox |
| #19 | P0-7 register fix · `PENDING` default (2 migrations) · ratchet guard · `@magnus/manual-billing` · register route deleted |
| #15 | **Closed as superseded by #19** |

Migrations applied: `20260820140000_add_pending_subscription_status`,
`20260820140100_default_subscription_status_pending`, `20260820180000_billing_audit_entry`

---

## 2. Blocker status

| ID | Status | Evidence |
|---|---|---|
| P0-1 test gate | **Closed** | `assert-test-count --min` floors; meta-tests prove the guard is non-vacuous |
| P0-3 DB coverage | **Closed** | CI [32372199367](https://github.com/chiosemen/magnus-non-profit-services/actions/runs/32372199367) — 21 migrations, ephemeral Postgres 16, 346 tests, **0 skips** |
| P0-4 data provenance | **Closed** | `null` + provenance; deterministic Herald ids; regression tests |
| P0-5 governance | **Closed** | this record |
| P0-6 middleware | **\<PENDING CHECK 4\>** | build manifest `[]` → `['/']`; deployed artifact verified below |
| P0-7 registration | **Closed in code** | live probe [32379291026](https://github.com/chiosemen/magnus-non-profit-services/actions/runs/32379291026) returned 405 pre-fix; route now deleted |
| P0-2 Stripe | **OPEN** | credential-gated to operator; not attempted |

---

## 3. P0-7 exposure assessment

**Defects (all on a public, unauthenticated, unthrottled endpoint):**

1. `worker.upsert` overwrote an existing account's `passwordHash` — account takeover from a known email.
2. `organization.upsert` on a **public EIN** returned the victim's org, renamed it, bound the
   attacker via `WorkerOrgRelationship`, and issued a session with `role: 'admin'` hardcoded.
3. `subscriptionTier: 'STARTER'` + `@default(ACTIVE)` minted entitled orgs that the agent scheduler
   then ran billable work for.

**Environment exposed:** `accord-web-staging` · project MAGNUS NON PROFIT SERVICES · environment
`staging` · database `accord-postgres-staging` (unexposed, private network only).

**Data at risk — measured, not assumed:**

```
<PASTE the psql output verbatim — Step 2 baseline, Postgres console>
Organization: <n>
Worker:       <n>
Donor:        <n>

<PASTE subscriptionStatus distribution>
subscriptionStatus | count
...
```

Operator runbook (authoritative sequence): [`docs/operations/STAGING_VERIFY_RUNBOOK_7430ad0.md`](../operations/STAGING_VERIFY_RUNBOOK_7430ad0.md)

Chrome / Railway **Postgres** console only (never `echo` / `env` / `printenv` / `cat` secrets):

```bash
psql "$DATABASE_URL" -c 'SELECT (SELECT count(*) FROM "Organization") AS orgs, (SELECT count(*) FROM "Worker") AS workers, (SELECT count(*) FROM "Donor") AS donors;'
psql "$DATABASE_URL" -c 'SELECT "subscriptionStatus", count(*) FROM "Organization" GROUP BY 1 ORDER BY 1;'
```

**Note:** `SET DEFAULT 'PENDING'` does **not** change existing rows. Non-zero ACTIVE orgs remain entitled until an audited deactivate.

**Conclusion:** \<state plainly. If all zero: "No records existed in the exposed database. No data
was at risk." If non-zero: describe what existed, and treat this section as an incident note
covering what was exposed and for how long.\>

**Exploitation:** none attempted or observed. Reachability was established by an unauthenticated
`GET` returning 405; no write path was exercised.

---

## 4. Staging verification

Run against the **post-deploy** build (`7430ad0` or successor). A pre-deploy run cannot verify a fix.

Migrations: from **`accord-web-staging` console** — `pnpm --filter @magnus/db prisma:deploy`  
(Not `psql -f` from Postgres — that skips `_prisma_migrations` and drifts.)

Then prove from Postgres console:

```
<PASTE _prisma_migrations LIMIT 4>
<PASTE Organization.subscriptionStatus column_default>
```

```
Check 1 — health
<PASTE>

Check 2 — security headers
<PASTE>

Check 3 — /app unauthenticated (OPTIONAL; label honestly — proves NOTHING about middleware)
curl -i -s https://staging.magnusnonprofitservices.com/app | head -n 5
<PASTE>
NOTE: Check 3 proves nothing about middleware. (protected)/app/page.tsx calls
requireAuthOrRedirect and emits the identical 307 with no middleware deployed.
Verified against pre-fix staging, run 32173120899.

Check 4 — middleware-specific probe (THE ONE THAT COUNTS — page-less route)
curl -i -s https://staging.magnusnonprofitservices.com/app/__middleware_probe_no_page | head -n 5
<PASTE status + Location>
307/308 → /login = middleware live. Only this lifts D2.
404 = P0-6 defect still present. STOP. Do not create p0-staging-verified.md.
```

**CI run:** \<URL\> **Result:** \<pass/fail\>

---

## 5. Known open items

- **P0-2 Stripe** — no valid test-mode credential placed; checkout, webhook replay, idempotency,
  receipt state and failure paths all unverified.
- **`role: 'admin'` hardcoded** in `login:96` and `refresh:71`; `TokenValidator.ts:178` authorises
  on it. No role column exists. Not exploitable while every user is admin of an org they created.
  **Must be resolved before any invite or multi-user flow.**
- **`getOrgTier`** — tier-only lookup, zero callers, bypasses the status-checked `isFeatureEnabled`.
- **`DATABASE_URL` on `accord-web-staging` is a raw credential**, not a service reference.
- **10 unmerged branches**, ~350 unique commits, awaiting keep-or-abandon review.
- **`20260527221311_seed_organizations_if_needed` seeds nothing** — misnamed.

---

## 6. What this record does NOT claim

- Not production-ready. GA remains blocked.
- **D2 GROWTH hold remains in force.** It lifts only when `docs/releases/p0-staging-verified.md`
  exists, and that file is created **only after a green Check 4** (`/app/__middleware_probe_no_page`
  → `307/308` to `/login`). It is a gate input read by `activate-org` — not documentation.
  Creating it early (or stuffing evidence into it instead of `docs/releases/<sha>.md`) silently
  unlocks GROWTH sales.
- Evidence belongs in `docs/releases/<sha>.md`. The gate file is a **separate deliberate commit**.
- No payment path is verified.
- No claim is made about any check not pasted above.
- The `PENDING` column default is not a mass de-entitlement of existing ACTIVE rows.
