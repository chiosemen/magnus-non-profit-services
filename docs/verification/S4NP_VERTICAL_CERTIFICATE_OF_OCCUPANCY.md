# Magnus Accord S4NP Vertical Verification Record

This document is retained as historical phase-verification evidence. It is not a current production approval. As of 2026-06-11, Magnus Accord remains under P0 hardening and private pilot/staging verification.

## 1. Executive Verdict
- **Current Status**: **Pilot/Staging Verification: In Progress**
- **Production Certification**: **Not Yet Approved**
- **Summary**: Earlier phase checks are useful evidence, but current private pilot eligibility still depends on the P0 gates in `BLOCKERS_TO_PRODUCTION.md` and `docs/operations/P0_PRODUCTION_HARDENING_BASELINE.md`.

---

## 2. Scope Verified
1. **Phase 1 — Donor CRM + Receipts**: Donor details and manual donations are org-scoped and auditable.
2. **Phase 2 — Campaign Pages + Stripe Connect**: Merchant models are enforced, webhook processing is idempotent, and donations are only written after successful webhook verification.
3. **Phase 3 — Fund Accounting Lite**: Rejects unbalanced ledger entries, enforces org boundaries on entries, and prevents updates of posted ledger records.
4. **Phase 4 — AI Concierge**: AI Concierge suggestions are written as proposals (`PENDING_REVIEW`) and cannot mutate final database state without explicit human approval.
5. **Phase 5 — Full Nonprofit Operating System**: Dynamic board packet rollup compiles CRM, campaigns, grants, compliance calendar, and volunteer impact data deterministically. MCP tools are strictly read-only or proposal-only.

---

## 3. Historical Commands Recorded
- **Monorepo Tests**: `pnpm test` was recorded as passing at the time of this phase record.
- **TypeScript Typecheck**: `pnpm run typecheck` and `npx tsc --noEmit` were recorded as passing for the then-current scope.
- **Web Build**: `pnpm run build` inside `apps/web` was recorded as passing for the then-current scope.
- **E2E Tool Integrations**: `npx jest --preset ts-jest --testMatch="**/*.test.ts"` inside `apps/mcp-connector` was recorded as passing for the then-current scope.

---

## 4. Test Results
- **Database Schema Guards**: verified 7 schema structures, orgId indexes, and proposals shape.
- **Service Layer Tests**: verified 19 test bounds covering board packet determinism, CSV mapping parser, and fund accounting isolation.
- **BFF / Router Tests**: verified 5 API boundaries, CSRF middleware triggers, and CORS safety.
- **MCP Integration & E2E Tests**: verified 12 request flow audits, auth rate limiters, and IDOR boundary traps.

---

## 5. Security Invariants
- **Fail-Closed Environment**: Backend services and BFF router endpoints fail closed when JWT secrets, authentication headers, or database environments are missing or mismatching.
- **Cross-Origin Mitigation (CSRF)**: All mutations (POST/PUT/PATCH/DELETE) require verification of origin headers against configured app URLs in production, rejecting untrusted requests with `403 Forbidden`.

---

## 6. Payment Invariants
- **Merchant Connect Model**: Stripe Connect merchant scopes are validated on campaign pages to ensure zero money movements occur outside authorized Connect IDs.
- **Webhook Success Verification**: Real donation entries are only created after receiving and verifying successful Stripe hook signatures.
- **Idempotency**: Webhook triggers use unique transaction keys, rejecting duplicate events cleanly.

---

## 7. Accounting Invariants
- **Debit/Credit Balance**: Double-entry ledger postings verify that the sum of all transaction allocations matches the net transaction amount (`debits === credits`), rejecting unbalanced allocations with validation errors.
- **Append-Only Ledger**: Once ledger transactions are posted, they cannot be updated or deleted, forcing adjustments to be registered as new reversing entries.
- **Traceability**: All allocations point to specific donor receipts and campaigns, preserving a transparent audit trail.

---

## 8. AI Authority Invariants
- **No Direct Mutation**: The AI Concierge can only construct proposal records (`ConciergeProposal` in `PENDING_REVIEW` state).
- **Human Approval Gate**: Moving money, publishing campaigns, or posting ledger records from proposals requires explicit human authentication (`actorName` sign-off) and database execution transactions.
- **Draft Branding**: All AI-derived narratives, packet descriptions, and drafts are visibly labeled with warnings and confidence ratings.

---

## 9. Tenant Isolation Proof
- **Org-Scoped Queries**: All database queries strictly bind where clauses to the authorized `orgId` payload (injected by TokenValidator at request middleware).
- **IDOR Trapping**: Attempting to pass custom cross-org identifiers (e.g. searching for donor IDs or EINs in another org) returns `404 Not Found` or `403 Forbidden`, fully auditing the attempt in `agentOperationalMemoryEntry`.

---

## 10. Known Limitations
- **Rate Limiting Fallback**: When `REDIS_URL` is not set, rate limiting falls back to an in-memory repository (per-instance limitation). Redis configuration is required for multi-instance production loads.

---

## 11. Production Blockers
- **Known P0 blockers remain**. Current production approval requires passing build/typecheck, route-level subscription gating, Redis fail-closed behavior, campaign/Stripe consolidation, staging smoke evidence, and observability integration.

---

## 12. Final Verdict
- **Production Certification: Not Yet Approved**. Treat this document as archived evidence, not a launch authorization.
