# Membership Roles — binding spec for replacing the hardcoded admin claim

**Status:** binding for `apps/web` authentication and for every consumer of the `role` claim.
**Owner:** @chinyeosemene
**Closes:** `docs/releases/7430ad0.md` §7 — "`role: 'admin'` hardcoded in `login:96` and `refresh:71`… Must be resolved before any invite or multi-user flow."
**Related:** `SPEC-P0.md` R6, R8, R10, R12, R13 · OWASP A01 (Broken Access Control), A07 (Identification and Authentication Failures)

Written before the implementation.

---

## 1. What is true today

Every login signs an access token with `role: 'admin'` as a string literal
(`api/auth/login/route.ts:96`); every refresh re-signs it the same way
(`api/auth/refresh/route.ts:71`). No column stores a role. The membership row
is `WorkerOrgRelationship` — unique per `(workerId, orgId)`, carrying an
employment `relationshipType` and an `endDate`, but nothing about authority.

Three facts about the claim, established by reading every consumer:

1. **Nothing in `apps/web` authorizes on it.** The claim is parsed
   (`lib/auth.ts`, `lib/auth/session.ts`) and carried, never compared.
2. **No Express service authorizes on it.** `@magnus/auth`'s middleware parses
   `role` into `req.auth` for org-dashboard-api, worker-financial-layer and
   claude-partner; none of them branch on its value.
3. **`apps/mcp-connector` uses a different token shape** (`roles: string[]`,
   `permissions: string[]`) and its `TokenValidator.hasRole` grants everything
   to `'admin'`. Web tokens do not satisfy its payload assertions. Out of scope
   here, noted so nobody assumes this spec covers it.

So the release record's "not exploitable while every user is admin of an org
they created" is accurate. The claim is decorative — until the first moment a
second person exists in an org, or the first route checks `role === 'admin'`.
That moment is the design-partner beta.

A fourth fact, found on the same code path and in the same class of defect:
**`endDate` is never consulted.** Login, refresh and `validateMembership` all
accept any relationship row, ended or not. An offboarded worker with a past
`endDate` can still authenticate and still passes the SSR guard's INV-4.

---

## 2. Threat model

| # | Threat | Today | After |
|---|---|---|---|
| T1 | A colleague invited into an org is admin by construction | Certain — the literal | Role read from their membership row; new rows default to `MEMBER` |
| T2 | A demoted or removed member keeps admin authority | Until access-token expiry, then re-minted as admin forever by refresh | Refresh re-reads the membership; demotion lands within one access-token lifetime (15 min); removal ends the session |
| T3 | An offboarded worker (`endDate` in the past) still authenticates | Yes, at login, refresh and every SSR guard | Refused at all three |
| T4 | A token carrying a role the system does not know | Any non-empty string accepted by `verifyAppToken` | Validated against the closed set at the trust boundary (R6) |
| T5 | A migration that silently changes who can do what | — | Backfill preserves the status quo exactly; default for new rows is least privilege; both proved at the database, not the schema file (R11) |

Not addressed: an invite flow (does not exist), admin-only routes (none exist
yet — this spec ships the predicate they will use), the mcp-connector token.

---

## 3. Requirements

**MR-1 — Role lives on the membership. [A01, R10]**
`WorkerOrgRelationship.role` of enum `OrgRole { ADMIN, MEMBER }`, `NOT NULL`,
`DEFAULT 'MEMBER'`. Authority is a property of a worker *in an org*, never of
the worker alone — the same tenant boundary R10 protects.

**MR-2 — The claim is derived, never written. [A01]**
`role` in the access token is read from the membership row at login **and at
refresh**. No literal role appears in `login/route.ts` or `refresh/route.ts`.
Refresh that finds no active membership revokes the session, clears both
cookies and returns 401.

**MR-3 — Only active memberships authenticate. [A07]**
Active means `endDate IS NULL OR endDate > now()`. Enforced at login, at
refresh, and in `validateMembership` (hence the SSR guard's INV-4).

**MR-4 — Closed set at the trust boundary. [R6]**
Token `role` is `'admin' | 'member'`, lowercase, mapped from the enum in one
place. `verifyAppToken` rejects anything else. Existing tokens in the wild carry
`'admin'` and remain valid.

**MR-5 — Least privilege for new rows; status quo for existing rows. [R8, R13]**
The migration is additive: `CREATE TYPE`, `ADD COLUMN … DEFAULT 'MEMBER'`, then
`UPDATE … SET role = 'ADMIN'` for every row that exists at migration time. Every
existing membership has been *effectively* admin since the literal was written;
the backfill makes that explicit and revocable per row instead of implicit and
universal. Backfilling `MEMBER` would be a silent narrowing that could lock the
real owners out the day an admin-only route ships. The operator then
characterises each of the existing relationships, exactly as §6 asks for the
six `ACTIVE` orgs.

**MR-6 — Proved at the database. [R11]**
A DB integration test asserts, against the migrated ephemeral Postgres: the
enum exists with both values; the column default is `MEMBER`; a membership
created without an explicit role is `MEMBER`; an ended membership is not
"active" by the predicate the application uses.

**MR-7 — One predicate for future gates.**
`hasRole(payload, 'admin')` in `apps/web/src/lib/auth` — `admin` satisfies any
role; `member` satisfies only `member`. Shipped with tests so the invite flow
and the first admin-only route use it rather than re-deriving it.

**MR-8 — Every check observed red first. [R5, R12]**

---

## 4. Pre-deploy — operator, before `prisma migrate deploy` on staging

```sql
-- how many memberships will the backfill mark ADMIN (expected: 11, per §3 of 7430ad0)
SELECT count(*) FROM "WorkerOrgRelationship";

-- how many are already ended and will lose access under MR-3
SELECT w.email, o.name, r."endDate"
FROM "WorkerOrgRelationship" r
JOIN "Worker" w ON w.id = r."workerId"
JOIN "Organization" o ON o.id = r."orgId"
WHERE r."endDate" IS NOT NULL AND r."endDate" <= now();
```

Anyone in the second result loses access on deploy. If that is wrong for a
row, clear its `endDate` first; the migration does not touch `endDate`.

## 5. Post-deploy — operator review, same shape as §6

```sql
SELECT w.email, o.name, r.role, r."endDate"
FROM "WorkerOrgRelationship" r
JOIN "Worker" w ON w.id = r."workerId"
JOIN "Organization" o ON o.id = r."orgId"
ORDER BY o.name, w.email;
```

Every row is `ADMIN` by backfill. Demote to `MEMBER` any worker who is not the
organization's operator. The change takes effect on their next refresh, within
15 minutes, with no code.

---

## 6. Verification plan

| Requirement | Test |
|---|---|
| MR-1, MR-5, MR-6 | `packages/db/src/tests/membershipRole.test.ts` — enum, default, insert-without-role, active predicate (ephemeral Postgres) |
| MR-2 | `apps/web/__tests__/membership-role-claim.test.js` — no role literal in login/refresh; both read the membership; refresh revokes on missing membership |
| MR-3 | same file — `isMembershipActive` cases; `validateMembership` filters on `endDate` |
| MR-4 | same file — `toTokenRole` mapping, closed set, `verifyAppToken` rejects unknown roles |
| MR-7 | same file — `hasRole` truth table |
| MR-8 | red-first output in the PR body |

Pure decision logic lives in `apps/web/src/lib/auth/roles.js` (plain CommonJS,
typed by `roles.d.ts`) for the same reason `public-surface.js` does: the web
suite runs `node --test` against the built artifact with no TypeScript step,
and the test must exercise the real predicate the routes use.

---

## 7. Residual risk

- A demotion is not instantaneous: an access token already issued stays valid
  up to 15 minutes. Session revocation exists (`revokeSession`) for the case
  that cannot wait.
- No route is admin-gated yet. This spec makes gating *possible and correct*;
  it does not add gates. The first gate ships with the invite flow.
- The mcp-connector's own `roles[]` token remains as it was.
- `@magnus/auth`'s Express middleware (`parseRole`) still accepts any non-empty
  string as a role for org-dashboard-api, worker-financial-layer and
  claude-partner. None of them branch on the value today. Tighten it to the
  same closed set in the PR that adds the first downstream role gate, with a
  red-first test of its own — not here, where it would widen this change's
  blast radius across three services for no behavioural gain yet.
- `isMembershipActive` is evaluated in the application after
  `findActiveMembership` already filtered at the database. That is deliberate
  redundancy at the trust boundary, not a second source of truth: the JS
  predicate and the Prisma predicate are asserted to agree.
