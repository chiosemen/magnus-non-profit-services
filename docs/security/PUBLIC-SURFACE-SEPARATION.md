# Public Surface Separation — binding spec for the apex marketing deployment

**Status:** binding for any deployment that serves a public marketing hostname.
**Owner:** @chinyeosemene
**Applies to:** `apps/web`
**Related:** `SPEC-P0.md` R14 · `docs/releases/7430ad0.md` (§7 open items) · `accord-security-policy.yaml`

Written before the implementation, per the Magnus standing rule that a
constraint which matters is encoded as a gate rather than written as an
instruction.

---

## 1. Decision

The Accord landing (`/`, `/book-audit`, and now `/snapshot`) is merged to `main` but reaches no
public hostname. The apex `magnusnonprofitservices.com` serves an unrelated
one-page site; the Next application — landing *and* `/login`, `/app/*`,
`/api/*` — exists only on `staging.magnusnonprofitservices.com`.

Pointing the apex at the existing staging service would publish the
application surface at the same time as the landing. That is not acceptable
while `docs/releases/7430ad0.md` §7 stands open: `role: 'admin'` is hardcoded
at `api/auth/login/route.ts:96` and `api/auth/refresh/route.ts:71`, six
organizations hold `ACTIVE` entitlement with no `BillingAuditEntry` basis, and
no payment path has been verified.

**Decision:** the public marketing hostname is served by a *second deployment
of the same artifact*, running in `MARKETING_ONLY` mode, holding **no
application credentials** and serving **no application routes**. The
application keeps its own hostname and its own auth boundary, unchanged.

One artifact, two environments. The mode is an environment property, not a
build flag, so the artifact that passed CI is the artifact that ships to both.

---

## 2. Threat model

The asset is the nonprofit data already resident in the application database:
6 organizations, 11 workers, 2 donor records (§3 of the release record —
measured, not assumed).

| # | Threat | Why the apex makes it worse |
|---|---|---|
| T1 | Credential-stuffing / brute force against `/api/auth/login` | The apex is the hostname that will appear on outbound material, in search, and in link previews. Publishing `/login` there advertises an auth surface to an audience that has no business account. |
| T2 | Privilege inheritance via the hardcoded `role: 'admin'` claim | Any account created on that deployment is admin of its org. Wider exposure raises the value of a single credential compromise. |
| T3 | Enumeration of the application topology | `/app/*`, `/api/*` responding at all discloses that the marketing domain fronts an application, and which framework and routes it runs. |
| T4 | Credential exposure through the deployment environment itself | A marketing service that carries `DATABASE_URL` can reach the database whether or not any route is routable. §7 already records a plaintext `DATABASE_URL` pasted into `accord-web-staging`; a second service is a second chance to repeat it. |
| T5 | Silent mode failure | A marketing service that boots with `MARKETING_ONLY` unset or malformed would serve the full application on the public apex with no signal. |

Out of scope for this spec: the application deployment's own auth boundary
(P0-6, verified live), and anything reachable only from the application
hostname.

---

## 3. Requirements

Each is testable and each has a named test. OWASP Top 10 mapping in brackets.

**PS-1 — Allowlist, not denylist. [A01]**
In `MARKETING_ONLY` mode the deployment serves exactly: `/`, `/book-audit`,
`/snapshot` (the free funding snapshot carried over from the previous apex
site), and Next build assets (`/_next/*`, `/favicon.ico`, `/robots.txt`,
`/sitemap.xml`). Every other path is blocked. A route added to the
application later is blocked by default, without anyone remembering to add it
to a list.

**PS-2 — Blocked paths return 404, opaque. [A01]**
Not 403, not a redirect, no response body, and no header that identifies the
mode. A 403 confirms the path exists; a redirect confirms where it went. The
marketing deployment must be indistinguishable from a site that never had an
application behind it, so `x-powered-by` is disabled too (T3).

**PS-3 — No application credentials in the marketing environment. [A05, A07]**
The service fails closed at boot when `MARKETING_ONLY` is set and any declared
application variable is present. The permitted set is `MARKETING_ONLY`,
`NODE_ENV`, `PORT`, `LOG_LEVEL`, `NEXT_PUBLIC_APP_URL`; the forbidden set is
**derived** from `serverEnvSchema` — every other declared variable, so a
credential added to the schema next year is forbidden here without anyone
remembering to add it. Platform-injected variables (`PATH`, `RAILWAY_*`) are
out of scope. **Absence of the credential is the primary control; the routing
gate in PS-1 is defence in depth.** A gate that is the only thing between the
public internet and a live database credential is one bug away from being
nothing.

**PS-4 — The mode fails closed. [A05]**
`MARKETING_ONLY` is parsed as a strict boolean. A malformed value
(`"yes"`, `"1"`, `"TRUE "`) fails validation and the service does not boot,
rather than silently defaulting to serving the application (T5).

**PS-5 — Proved in the build artifact, not the source. [R11]**
The gate is asserted against `.next/server/src/middleware.js` and
`.next/server/middleware-manifest.json`, because a gate that exists only in
the source tree is the exact failure mode P0-6 shipped.

**PS-6 — No regression of the P0-6 auth boundary. [A01]**
With `MARKETING_ONLY` unset, behaviour is byte-for-byte what it was:
`/app/:path*` redirects to `/login`, everything else passes through
untouched. The widened matcher must not change any non-`/app` response.

**PS-7 — Every check observed red first. [R5, R12]**
No assertion in this change counts unless it was run against the pre-change
tree and seen to fail.

**PS-8 — One artifact, two environments.**
Mode is read at request time from the environment. No build-time branch, no
second build, no artifact that is only correct in one place.

**PS-9 — Only the marketing deployment invites indexing.**
Publishing the landing on the apex puts identical content on two hostnames.
`robots.txt` is resolved per request: the marketing deployment allows crawling,
the application deployment disallows all of it. Not a security control — an
authenticated application in a search index is an operational and SEO problem,
and this is the moment it is created.

**PS-10 — The apex HTML names no application path. [A01 · T1, T3]**
Every internal link on the Accord surface resolves on the marketing
deployment: a guard test walks every `href` in the chrome and pages and asks
the real allowlist predicate. No `/login`, `/app` or `/tools` link ships in the
public chrome — the middleware would 404 them, but merely printing the path in
public HTML is the disclosure T1 describes. During the private beta there is
no self-serve signup, so the apex has no logged-in audience; design partners
are given the application hostname directly. A login link returns as an
absolute link the day the application has a hostname of its own.

---

## 4. Non-goals

This change does **not**:

- fix the hardcoded `role: 'admin'` claim (§7 — still open, still required
  before any invite or multi-user flow);
- characterise or correct the six `ACTIVE` organizations (§6);
- verify any Stripe path (P0-2);
- lift the D2 GROWTH hold (`docs/releases/p0-staging-verified.md` still absent);
- make the application production-ready. It remains
  `READY_FOR_STAGING_PILOT`.

It publishes a static marketing surface and nothing else.

---

## 5. Verification plan

| Requirement | Test |
|---|---|
| PS-1 | `apps/web/__tests__/marketing-only-gate.test.js` — allowlist membership, prefix-confusion and case cases |
| PS-2 | same file — status is 404, no body, no mode header, `403` absent |
| PS-3 | `packages/config/src/tests/marketingOnlyEnv.test.ts` — each forbidden key rejected individually |
| PS-4 | same file — malformed values rejected, absent value = application mode |
| PS-5 | `marketing-only-gate.test.js` — assertions read `.next/server/src/middleware.js` and the middleware manifest |
| PS-6 | `apps/web/__tests__/middleware-manifest.test.js` (existing, unchanged) plus a pass-through assertion in the new file |
| PS-7 | red-first output recorded in the PR body |
| PS-8 | source assertion that the mode is read from `process.env` at request time |
| PS-9 | `marketing-only-gate.test.js` — robots.txt depends on the mode and is not statically generated |
| PS-10 | `accord-landing.test.js` — walks every `href` on the Accord surface against `isPublicMarketingPath`; asserts no `/login` in the chrome |

---

## 6. Residual risk — stated, not hidden

- The application deployment's own hostname stays publicly reachable. This
  spec protects the marketing hostname; it does not reduce the application's
  exposure. §7 remains the register for that.
- Cloudflare sits in front of the apex. It is a performance and DNS layer
  here, **not** a security boundary — origin hostnames remain directly
  reachable, so no control in this spec may depend on Cloudflare.
- `MARKETING_ONLY` protects a deployment, not a hostname. If both hostnames
  were ever pointed at the same service, the mode of that service decides. The
  runbook keeps them as two services for that reason.
- The gate reads the environment at request time inside Next's edge middleware
  sandbox. This is **verified for self-hosted `next start`** (Railway), which is
  where it runs. Moving `apps/web` to a managed edge platform changes how
  middleware sees `process.env` and requires re-running the runtime probes in
  the PR before trusting the gate there.
- The marketing service's health check must target `/`. `/api/health` returns
  404 in marketing mode by design, so a platform health check pointed at it
  would keep the service permanently unhealthy.
- Blocking `/campaigns/:slug` on the apex means donor-facing campaign links
  must continue to use the application hostname. No such link is published on
  the apex today, so there is nothing to break — but this is the constraint to
  remember before the first campaign goes out.
