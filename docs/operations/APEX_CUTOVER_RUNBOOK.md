# Apex cutover runbook — publishing the Accord landing

**Spec:** `docs/security/PUBLIC-SURFACE-SEPARATION.md` · **Rule:** SPEC-P0 R14
**Operator:** @chinyeosemene · **Rollback owner:** @chinyeosemene

Every command below is run by the operator. Nothing here is automated, and no
step in this file requires a credential to pass through an agent.

---

## 0. Where things stand before the cutover

Observed 2 September 2026:

| Hostname | Serves | DNS |
|---|---|---|
| `magnusnonprofitservices.com` (+ `www`) | an unrelated one-page site — "Most boards learn how concentrated their funding is at the wrong meeting", free Form 990 snapshot offer. Its copy is **not** in this repository. | Cloudflare (`104.21.36.128`, `172.67.194.94`), NS `melany`/`felicity.ns.cloudflare.com` |
| `staging.magnusnonprofitservices.com` | this application at `main` — Accord landing **and** `/login`, `/app/*`, `/api/*` | CNAME → `a8jp35gf.up.railway.app` |

So the landing merged at `88f852a` is reachable only on staging, and the apex
shows an older offer.

**This cutover replaces that one-pager.** Its free funding-concentration
snapshot offer is carried over intact at `/snapshot`, with a "Start smaller"
section on the landing and a nav link, through the same pre-addressed email
channel as the beta application. Its paid Clarity Package is **not** carried
over: `docs/releases/7430ad0.md` §7 marks that SOW's claims as unreviewed and
not to be sent to a client, and a test now keeps it off the marketing surface
until that changes.

---

## 1. Create the marketing service

On Railway, in project **MAGNUS NON PROFIT SERVICES**, create a **new service**
from `chiosemen/magnus-non-profit-services`, branch `main`.

- Name: `accord-web-marketing`
- Health check path: **`/`** — not `/api/health`. That path returns 404 in
  marketing mode by design; a health check pointed at it leaves the service
  permanently unhealthy.
- Do **not** attach the Postgres or Redis plugin to this service.

## 2. Variables — exactly these, nothing else

```
MARKETING_ONLY=true
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://magnusnonprofitservices.com
```

`PORT` is injected by Railway. `LOG_LEVEL` is optional.

**Do not copy the variable set from `accord-web-staging`.** The service refuses
to start if any declared application variable is present — `DATABASE_URL`,
`JWT_SECRET`, `REDIS_URL`, Stripe, Anthropic, AWS, SMTP and every other key in
`serverEnvSchema`. That refusal is the control, not an obstacle: the error names
the offending variables, and the fix is always to remove them from this service.

A malformed `MARKETING_ONLY` (`yes`, `1`, `TRUE`) also refuses to start rather
than defaulting to serving the application.

## 3. Verify on the Railway URL — before touching DNS

Against the service's generated `*.up.railway.app` hostname:

```bash
BASE=https://<service>.up.railway.app

# must be 200
curl -s -o /dev/null -w '%{http_code} /\n'            "$BASE/"
curl -s -o /dev/null -w '%{http_code} /book-audit\n'  "$BASE/book-audit"
curl -s -o /dev/null -w '%{http_code} /snapshot\n'    "$BASE/snapshot"

# must ALL be 404 with an empty body
for p in /login /app /app/donors /api/health /api/auth/me /tools \
         /campaigns/spring-appeal /app/__middleware_probe_no_page; do
  curl -s -o /dev/null -w "%{http_code} %{size_download}B $p\n" "$BASE$p"
done

# must be 404 — the auth endpoint is dead here, POST included
curl -s -o /dev/null -w '%{http_code} POST /api/auth/login\n' \
  -X POST -H 'content-type: application/json' \
  -d '{"email":"a@b.c","password":"x"}' "$BASE/api/auth/login"

# must be: User-Agent: *  /  Allow: /
curl -s "$BASE/robots.txt"

# must NOT appear
curl -sI "$BASE/" | grep -i x-powered-by

# must print nothing — the public HTML names no application path (PS-10)
for p in / /book-audit /snapshot; do
  curl -s "$BASE$p" | grep -oE 'href="/(login|app|tools|api)[^"]*"'
done
```

If any application path returns anything other than `404 0B`, **stop** and do
not move DNS.

## 4. DNS cutover (Cloudflare)

1. **Record the current apex and `www` records first** — type, name, content,
   proxy status — into this file or a paste in the PR. That record is the
   rollback.
2. Add the custom domain `magnusnonprofitservices.com` (and `www`) to the
   `accord-web-marketing` service in Railway and take the target hostname it
   gives you.
3. In Cloudflare, repoint apex and `www` at that target. Keep the orange cloud
   if it is on today — but note that Cloudflare is a performance and DNS layer
   here, **not** a security boundary; every control in this cutover lives in the
   service.

## 5. Verify after cutover

Re-run every probe from step 3 against `https://magnusnonprofitservices.com`,
plus:

```bash
# the application must be untouched on its own hostname
curl -s -o /dev/null -w '%{http_code} staging /app\n' \
  https://staging.magnusnonprofitservices.com/app          # expect 307
curl -s https://staging.magnusnonprofitservices.com/robots.txt  # expect Disallow: /
```

## 6. Rollback

Restore the apex and `www` records captured in step 4.1. Propagation is the only
cost; nothing in the application changes, because the application deployment was
never touched. The marketing service can be left running — it serves nothing
harmful on its Railway hostname.

---

## 7. After the cutover — still open

These are not blocked by this change and are not fixed by it:

- **`role: 'admin'` is still hardcoded** (`api/auth/login/route.ts:96`,
  `api/auth/refresh/route.ts:71`). Required before any invite or multi-user
  flow — which a design-partner beta becomes on its second user.
- **Six organizations hold `ACTIVE` entitlement with no `BillingAuditEntry`**
  (release record §6). Characterise them as real or test, then either
  `deactivateOrg` or write a compensating audit row.
- **P0-2 Stripe is unverified.** If the beta converts, there is no verified
  payment path behind it.
- **`accord-web-staging` still holds a raw `DATABASE_URL`** instead of
  `${{Postgres.DATABASE_URL}}` — a plaintext secret visible in the Variables
  tab, unrelated to this cutover and still true.
- **Applications arrive as email**, not tracked intake. That is the right shape
  at zero volume; revisit it with a security review when volume justifies a
  stored record of nonprofit contact data.
- **Brand fonts do not ship.** `font-src 'self'` blocks font CDNs; `next/font`
  self-hosting is the compliant fix.
- **Donor campaign links must use the application hostname.**
  `/campaigns/:slug` returns 404 on the apex by design.
