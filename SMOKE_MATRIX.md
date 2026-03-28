# Magnus Accord — Smoke Test Coverage Matrix

This document tracks critical smoke test coverage across all Magnus services.

**Last Updated:** 2026-03-28
**Coverage Status:** 🟡 CI runs Postgres-backed integration tests (`pnpm test`) plus workspace smoke suites (`pnpm -r --if-present test`)

---

## Coverage Summary

| Service | Tests | Health | Auth | Protected Routes | Webhooks | In-Process |
|---------|-------|--------|------|------------------|----------|------------|
| **agents** | ✅ 39 | N/A | N/A | N/A | N/A | ✅ |
| **billing** | ✅ 11 | ✅ | N/A | N/A | ✅ | ✅ |
| **claude-partner** | ✅ 6 | N/A | N/A | N/A | N/A | ✅ |
| **grant-generator** | ✅ 25 | ✅ | ✅ | ✅ | N/A | ✅ |
| **mcp-connector** | ✅ 20 | ✅ | ✅ | ✅ | N/A | ✅ |
| **org-dashboard-api** | ✅ 10 | ✅ | ✅ | ✅ | N/A | ✅ |
| **worker-financial-layer** | ⚠️ Excluded | N/A | N/A | N/A | N/A | N/A |
| **web** | ⚠️ 0 | N/A | N/A | N/A | N/A | N/A |
| **mobile** | ⚠️ 0 | N/A | N/A | N/A | N/A | N/A |

**Total Tests:** 113
**Apps with Tests:** 7/9

---

## Service Details

### apps/agents

**Test Count:** 39 tests
**Test Files:**
- `src/tests/complianceWatchdog.rules.test.ts`
- `src/tests/dbAlertSink.idempotency.test.ts`
- `src/tests/env.failclosed.test.ts`
- `src/tests/fallbackAlertSink.test.ts`
- `src/tests/grantLifecycleManager.rules.test.ts`
- `src/tests/locks.test.ts`
- `src/tests/slackAlertSink.test.ts`
- `src/tests/workerIncomeOptimizer.rules.test.ts`

**Coverage:**
- ✅ Agent rule logic
- ✅ Alert sink behavior (DB, Slack, Fallback, Console)
- ✅ Environment fail-closed validation
- ✅ Database advisory locks
- ✅ Dedupe key stability

**Run:** `pnpm --filter @magnus/agents test`

---

### apps/billing

**Test Count:** 11 tests (1 unit + 10 smoke)
**Test Files:**
- `src/tests/subscriptionSyncService.test.ts` (unit)
- `__tests__/smoke.test.js` (smoke)

**Coverage:**
- ✅ Health endpoint (public)
- ✅ Stripe webhook signature validation
- ✅ Webhook event handling
- ✅ Subscription status mapping
- ✅ Error responses (404, 500)

**Critical Paths:**
- `GET /health` → 200 (unauthenticated)
- `POST /webhooks/stripe` → 400 (missing signature)
- `POST /webhooks/stripe` → 400 (invalid signature)

**App Export:** ✅ `src/app.ts` exports `createApp()`
**Run:** `pnpm --filter @magnus/billing test`

---

### apps/claude-partner

**Test Count:** 6 tests
**Test Files:**
- `src/tests/env.test.ts`
- `src/tests/orgClaudeConfigService.test.ts`
- `src/tests/promptLibraryService.test.ts`
- `src/tests/usageAuditService.test.ts`

**Coverage:**
- ✅ Environment validation
- ✅ Org config service
- ✅ Prompt library service
- ✅ Usage audit service

**Run:** `pnpm --filter @magnus/claude-partner test`

---

### apps/grant-generator

**Test Count:** 25 tests (12 base + 13 route)
**Test Files:**
- `__tests__/smoke.test.js` (auth + validation)
- `__tests__/routes.smoke.test.js` (routes + features)

**Coverage:**
- ✅ Health endpoint (public)
- ✅ JWT auth middleware
- ✅ Zod request validation
- ✅ Org scoping checks
- ✅ Subscription feature checks (grant_generator)
- ✅ Protected routes (POST /api/generate, GET /api/proposals, POST /api/status/:id)
- ✅ Error responses (401, 403, 404, 500)

**Critical Paths:**
- `GET /health` → 200 (unauthenticated)
- `POST /api/generate` → 401 (no token)
- `POST /api/generate` → 403 (feature not enabled)
- `GET /api/proposals` → 200 (valid token + feature)

**App Export:** ✅ Exports app instance
**Run:** `pnpm --filter @magnus/grant-generator test`

---

### apps/mcp-connector

**Test Count:** 20 tests
**Test File:** `__tests__/smoke.test.js`

**Coverage:**
- ✅ Health endpoint (public)
- ✅ TokenValidator (expired, invalid, missing tokens)
- ✅ Tool permission checks (wildcard, specific, category, admin)
- ✅ Tool registry (naming, categories)
- ✅ Request validation
- ✅ Error responses (401, 403, 404)

**Critical Paths:**
- `GET /health` → 200 (unauthenticated)
- `GET /api/tools` → 401 (no token)
- `POST /api/tools/:toolName` → 401 (no token)
- `POST /api/tools/:toolName` → 403 (insufficient permissions)
- `POST /api/tools/:toolName` → 404 (unknown tool)

**App Export:** ✅ Exports `app` from `src/server.ts`
**Run:** `pnpm --filter @magnus/mcp-connector test`

---

### apps/org-dashboard-api

**Test Count:** 10 tests
**Test File:** `__tests__/smoke.test.js`

**Coverage:**
- ✅ Health endpoint (public)
- ✅ JWT auth middleware
- ✅ Protected routes (GET /api/org/overview, /api/org/compliance, /api/org/grants)
- ✅ Subscription feature checks (compliance_calendar, grant_generator)
- ✅ Error responses (401, 403, 404)

**Critical Paths:**
- `GET /health` → 200 (unauthenticated)
- `GET /api/org/overview` → 401 (no token)
- `GET /api/org/overview` → 403 (feature not enabled)
- `GET /api/org/compliance` → 200 (valid token + feature)

**App Export:** ✅ Exports `app` from `src/server.ts`
**Run:** `pnpm --filter @magnus/org-dashboard-api test`

---

### apps/worker-financial-layer

**Status:** Excluded from current release scope (app refuses to start without `ALLOW_WORKER_FINANCIAL_LAYER=true`). Repository unit tests exist but are not part of the production smoke bar until the surface re-enters scope.

---

### apps/web

**Status:** ⚠️ No tests
**Type:** Next.js frontend
**Note:** Frontend apps typically don't have smoke tests in this pattern. Consider E2E tests separately.

---

### apps/mobile

**Status:** ⚠️ No tests
**Type:** React Native frontend
**Note:** Mobile apps typically don't have smoke tests in this pattern. Consider E2E tests separately.

---

## Test Execution

### Run All Tests

```bash
# Postgres-backed integration suite (Vitest)
pnpm test

# Package/service smoke suites
pnpm -r --if-present test

# Run specific service
pnpm --filter @magnus/<service> test
```

### Expected Output

- `pnpm test` exercises grant-generator, org-dashboard-api, and mcp-connector HTTP stacks against the real database schema.
- `pnpm -r --if-present test` runs each package’s smoke or unit suite; CI reports per-package pass/fail.

---

## CI Integration

### GitHub Actions

CI provisions PostgreSQL 16, runs Prisma migrations, then executes both integration and smoke suites:

```yaml
- name: Prisma migrate deploy
  run: pnpm --filter @magnus/db prisma:deploy
- name: Run integration tests
  run: pnpm test
- name: Run package smoke tests
  run: pnpm -r --if-present test
```

**Merge Blocker:** Any failing step blocks merge.

---

## In-Process Testability

All services export their Express app instances for in-process testing:

### Pattern

```typescript
// src/server.ts or src/app.ts
export { app };

// Only listen when run directly
if (require.main === module) {
  app.listen(port, () => console.log(`Service listening on ${port}`));
}
```

### Services Following This Pattern

- ✅ **billing:** `src/app.ts` exports `createApp()`
- ✅ **grant-generator:** Exports app instance
- ✅ **mcp-connector:** `src/server.ts` exports `app`
- ✅ **org-dashboard-api:** `src/server.ts` exports `app`

### Benefits

- No need to spawn actual HTTP server for tests
- Faster test execution
- Better isolation
- Easier to mock dependencies

---

## Coverage Gaps & Future Work

### Web App (apps/web)

- **Status:** No tests
- **Recommendation:** Add Playwright E2E tests for critical flows
- **Priority:** Low (frontend testing is separate concern)

### Mobile App (apps/mobile)

- **Status:** No tests
- **Recommendation:** Add Detox E2E tests for critical flows
- **Priority:** Low (mobile testing is separate concern)

### Integration Tests

- **Status:** Not in scope for smoke tests
- **Recommendation:** Consider adding integration tests that test multiple services together
- **Priority:** Medium

---

## Maintenance

### Adding New Tests

1. Create `__tests__/smoke.test.js` in service directory
2. Add `test` script to `package.json`
3. Update this matrix
4. Run `pnpm -r --if-present test` to verify

### Updating Existing Tests

1. Modify test file
2. Run tests locally: `pnpm --filter @magnus/<service> test`
3. Update this matrix if coverage changes
4. CI will validate on PR

---

## Contact

Questions about testing strategy? Contact the engineering team.

**Last Audit:** 2026-03-08
**Next Audit:** 2026-04-08
