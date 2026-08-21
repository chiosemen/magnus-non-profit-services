# SPEC-P0 — Binding Security & Quality Spec

**Repository:** `chiosemen/magnus-non-profit-services`
**Status:** binding. An agent that cannot satisfy a rule stops and reports; it does not proceed and document the gap.
**Applies to:** Claude Code, Codex SOL, Cursor, Antigravity, and any human authoring a change.
**Last updated:** 20 Aug 2026

---

## 0. How to use this document

Every change must be justified against §2 *before* it is written, not after:

1. State the threat the change addresses or introduces.
2. State which rule constrains it.
3. Write the test that fails today — **and watch it fail** (R12).
4. Write the code.
5. Show the test passing and the audit clean.

A change that cannot name its threat model does not get written.

---

## 1. Binding rules

Grounded in the OWASP Top 10. Each rule names the failure it prevents, because a rule whose purpose
is not understood gets worked around.

### R1 — No hardcoded secrets *(A05, A07)*
No key, token, connection string, webhook secret, or credential in source, tests, fixtures, or CI
config. TruffleHog passes before PR. Ephemeral values are generated at runtime
(`openssl rand -hex 32`), never committed — not even dummy ones.

### R2 — No test may pass vacuously
A test command matching zero files **must exit non-zero**. Every package asserts a minimum
discovered-test count. **Prevents:** a green gate that ran nothing — worse than a red one, because
a red gate stops a release and a false green ships it.

### R3 — No non-ephemeral database in any test path *(A01, A08)*
CI refuses to run if `DATABASE_URL` is not a throwaway host. The guard runs *before* any suite
touches the database, including teardown.

### R4 — No fabricated values in any payload *(A08)*
Absent data is `null` plus explicit provenance (`{ value, status: 'DATA_UNAVAILABLE', source, asOf }`).
Never `0`, never `50`, never a random identifier. Enforced at the type level. **Prevents:** a
nonprofit compliance platform asserting financial facts it does not have.

### R5 — Every fix ships with a test that fails before it and passes after
No exceptions for "documentation-only" changes that alter behaviour.

### R6 — Validate and type every trust boundary *(A03)*
MCP tool arguments, webhook bodies, route params, query strings. Pagination clamped. Parsing
failures rejected, not coerced.

### R7 — Secrets never enter a prompt or a log — proved by test *(A09)*
A comment asserting redaction is not evidence; a test asserting it is.

### R8 — Additive-only migrations *(A08)*
`validate-migrations.js` is a hard gate. No DROP, no RENAME, no destructive drift.
*Known limitation:* it substring-matches without stripping SQL comments, so a comment mentioning
`DROP TABLE` will fail the gate. This fails in the safe direction; word migration comments around it.

### R9 — No change widens agent autonomy
The `internal_only` / `ask_first` / `never` matrix is a runtime ceiling, not a prompt suggestion.

### R10 — Tenant scope is a security boundary *(A01)*
Every read and write preserves `orgId`. Org scoping is never a UI filter. **A public identifier is
not an authorisation token** — see P0-7.

### R11 — Security controls must be proved present in the *build*, not the source
A control that exists in source but does not ship is not a control. Where presence depends on
framework resolution — middleware, instrumentation, edge config — the test asserts against the
compiled artifact. **Prevents:** P0-6.

### R12 — Every new check must be run against the defective state and observed to fail — **HARD RULE**

Before a test, guard, gate, or CI check is committed, run it against the broken code and confirm it
goes red. **A check never observed failing is not evidence that anything is safe.**

The author states this explicitly in the PR: *"I ran this check against the broken state and
observed it fail."* If that isn't possible, say so and explain why.

**Prevents:** the recurring failure mode of this codebase. Five vacuous gates were found in a single
day, every one of which would have shipped as proof of safety:

1. `pnpm test` — the P0-1 root command; ran zero tests, reported success
2. The `/app` redirect check — passed against a build with an empty middleware manifest, because a
   server-component guard emitted the identical redirect
3. `update:\s*\{[^}]*passwordHash` — `[^}]*` stopped at a nested `{ name }`, so it went green
   against the live password-overwrite bug it existed to catch
4. A test calling `createCampaignCheckoutSession` — a plausible-sounding function that does not exist
5. A PENDING-denial test whose payload omitted required fields, so it failed on input validation
   before reaching the guard under test

Three were the codebase's own gates. Two were written by an agent *in the PR that added this rule*.
Assume you are about to write the sixth.

### R13 — Fixtures state their own preconditions
Test data never inherits a security-relevant value from a schema default. A fixture that relies on
`@default(...)` for tier, status, or scope is asserting something it does not say.
**Prevents:** the `setupTestOrg` failure — a fixture silently depending on `@default(ACTIVE)`.

### R14 — No `db push` against a deployed environment *(A08)*
`prisma db push` writes schema objects without recording `_prisma_migrations`. Staging
on SHA `7430ad0` reached `P3009` because type `"FundType"` already existed while the
migration was recorded failed — the objects were real, the history was not. **Never
run `db push` against a deployed environment.** Apply schema with
`pnpm --filter @magnus/db prisma:deploy` from the app service that has the repo
checkout. If objects exist and history does not, verify object existence first, then
`migrate resolve --applied` only when that measurement matches. **Prevents:** the
staging drift in release `7430ad0`.

---

## 2. Blocker register

| ID | Issue | Status | Evidence |
|---|---|---|---|
| **P0-1** | Release test gate ran nothing | **Closed** | `assert-test-count --min` floors + meta-tests proving the guard is non-vacuous |
| **P0-2** | Stripe payment path unverified | **Open** | Credential-gated to the operator. Claude never handles the key. |
| **P0-3** | 13 DB tests skipped | **Closed** | CI 32372199367 — 21 migrations to ephemeral Postgres, 346 tests, **0 skips** |
| **P0-4** | Synthetic values in MCP payloads | **Closed** | `null` + provenance; deterministic Herald ids; regression tests |
| **P0-5** | Release governance inconsistent | **Closed** | Dated release record supersedes the stale blocker file |
| **P0-6** | Auth middleware absent from build | **Closed — verified live** | SHA `7430ad0` Check 4: `GET /app/__middleware_probe_no_page` → 307 `/login`. Pre-deploy on the identical URL was 404. |
| **P0-7** | Public registration: account takeover, tenant attach, free entitlement | **Closed** | Route + UI deleted in #19. Live 405 probe (run 32379291026) proved the old path reachable before deletion. |

### P0-7 detail

`/api/auth/register` — public, unauthenticated, unthrottled:

- `worker.upsert` **overwrote an existing account's `passwordHash`** — account takeover for any known email.
- `organization.upsert` on a **public EIN** returned the victim's org, renamed it, bound the attacker
  via `WorkerOrgRelationship`, and issued a session — with `role: 'admin'` hardcoded.
- `subscriptionTier: 'STARTER'` + `@default(ACTIVE)` minted entitled orgs that `scheduler.ts`
  then ran agent work for.

**Fixed:** `/api/auth/register` route and `/register` UI deleted (#19). New orgs are
operator-created `PENDING` via `@magnus/manual-billing`. `subscriptionStatus` defaults
to `PENDING`.

**Outstanding debt:** `role: 'admin'` remains hardcoded in `login:96` and `refresh:71`, and
`TokenValidator.ts:178` authorises on it. There is no role column — `WorkerOrgRelationship` carries
only `relationshipType`. Not exploitable while every user is admin of an org they created
themselves. **Must be resolved before any invite or multi-user flow ships.**

---

## 3. Known structural mismatches

Not bugs. Places where the code and the business model disagree, which will pull work in the wrong
direction if left unnamed.

1. **Stripe webhooks are not the launch activation path.** `subscriptionSyncService.ts`
   still writes `ACTIVE` from Stripe subscription webhooks. Launch activation is
   `@magnus/manual-billing` (`activate-org`) after PayPal invoice / Stripe Payment Link.
   Do not wire self-serve Stripe subscriptions as the default entitlement path — that
   would contradict D1/D3. Stripe checkout remains P0-2 (unverified).
2. **Self-serve registration is deleted.** Operator creation is `@magnus/manual-billing`
   (`create-org` → `PENDING`). Do not reintroduce a public `/api/auth/register` route.
3. **`20260527221311_seed_organizations_if_needed` seeds nothing.** It contains three
   `ALTER TABLE … DROP DEFAULT` statements and no inserts. **Do not rename** — the
   folder name is already recorded in `_prisma_migrations` on staging; renaming it
   breaks deploy checksums. Treat the name as a historical misnomer.
4. **`getOrgTier` is a tier-only lookup with zero callers** — the exact bypass of the
   status-checked `isFeatureEnabled`. One careless import from becoming a hole. Lint against it or
   delete it.

---

## 4. Merge gate

No PR merges without all of:

1. Root `pnpm test` green in CI from a clean checkout
2. TruffleHog, semgrep, eslint, `tsc --noEmit` clean
3. A test that fails before the change and passes after — **observed failing** (R12)
4. Independent review against this spec by an actor that did not write the change
5. Linked CI run recorded in the release document

No direct pushes to `main`. No merge on a red gate.

---

## 5. Out of scope

Production deploys as a side effect of merge · widening agent autonomy · handling live financial
credentials or customer data · declaring a blocker closed on assertion rather than artifact.
