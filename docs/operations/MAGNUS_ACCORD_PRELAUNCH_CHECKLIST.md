# Magnus Accord PRELAUNCH Staging/Launch Gate Checklist

**Status**: [DRAFT] Active against Wave 5 Remediation Standards
**Objective**: Guarantee that Staging perfectly mirrors Production boundaries before pushing traffic to V1 logic.

## 0. Evidence Authority

Signed launch evidence must come from the named production-like staging environment: **`magnus-accord-staging`**.

- [ ] Staging URL is durable and separate from local/preview environments.
- [ ] Staging database is separate from production and seeded with: Starter/inactive org, Growth/Enterprise eligible org, published campaign, unpublished campaign, and archived campaign if supported.
- [ ] Staging Redis is provisioned and observable.
- [ ] Stripe is **test mode only**; no `sk_live`, `pk_live`, live Connect account, or production payment object is present.
- [ ] Test JWTs, request logs, CI artifacts, and smoke outputs are captured.
- [ ] Local machine evidence and casual preview deployments are not used as signed launch evidence.

Approval ownership:

- **Implementation owner:** Codex.
- **Technical verification owner:** Hermes Agent.
- **Launch checklist owner / final approval:** GrandMaster Chi / Product Owner.
- No agent self-approves its own patch.

## 1. Environment Parity
All core cluster services (`web`, `org-dashboard-api`, `worker-financial-layer`, `agents`, `mcp-connector`, `grant-generator`, `claude-partner`, `billing`) must undergo exact `.env.template` verification.
- [ ] `NODE_ENV` is explicitly `production`.
- [ ] **No Default Secrets**: Verify `JWT_SECRET`, `ENCRYPTION_KEY`, and Stripe keys contain randomly generated secure bytes, distinct from any template.
- [ ] `ENCRYPTION_KEY` is explicitly 64-character hexadecimal (fails boot otherwise).
- [ ] `NEXT_PUBLIC_APP_URL` identically matches the deployed Vercel/Firebase origin avoiding CSRF deadlocks.
- [ ] `REDIS_URL` is mounted; in-memory rate limiting is entirely abandoned in production clusters.

## 2. Infrastructure & Migrations
- [ ] Ensure database migrations are purely additive (`npx prisma migrate deploy`).
- [ ] `MAGNUS_ACCORD_AUTONOMOUS_OPS_SHAPE` validation succeeds naturally inside `apps/agents` container initialization.
- [ ] Verify `ENCRYPTION_KEY` maps locally against `packages/db` so that `plaidAccessToken` records transparently decipher on boot tests.

## 3. Auth, Security & CSRF Verification
- [ ] Access the web client `NEXT_PUBLIC_APP_URL`. Confirm mutation (POST/PUT/DELETE) requests block untethered Origins.
- [ ] Intercept a header across the dashboard BFF to verify `Strict-Transport-Security`, `X-Frame-Options`, `Content-Security-Policy` and `Permissions-Policy` apply globally per NextJS `headers()`.

## 4. Observability Validation
- [ ] `SENTRY_DSN` mapping is active across Edge boundaries (`web`) and Container Boundaries (`agents`). 
- [ ] Inspect usage audits: submit a mocked usage ping beyond the Token Ceiling limits in `apps/claude-partner` and verify it raises a `USAGE_CAP_EXCEEDED` 429 response explicitly.

## 5. Agents Control
- [ ] Boot `apps/agents` with `AGENTS_ENABLED=true`.
- [ ] Validate that individual kill-switches default safely (e.g., `AGENT_ENABLE_BOARD_ORACLE=false`) unless manually flipped during the feature rollout.
- [ ] Validate `ORACLE_ALLOW_EXTERNAL_SEND=false`.

## Launch Gate Command
If any of these boxes are unchecked or ambiguous during Staging sync, **Abort Launch**. Fail Closed.
