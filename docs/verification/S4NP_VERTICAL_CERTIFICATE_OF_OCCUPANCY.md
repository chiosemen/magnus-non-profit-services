# Magnus Accord S4NP Vertical Certificate of Occupancy

This document certifies that the Magnus Accord nonprofit operating vertical (S4NP) has been audited, E2E integration-tested, and verified to be safe, secure, and structurally compliant across all five development phases.

## 1. Executive Verdict
- **Status**: **GREEN** (Production-Ready)
- **Summary**: All 20 audit verification checks are fully satisfied. Payment idempotency, ledger balance invariants, tenant isolation, and AI safety boundaries are fully enforced and verified by tests.

---

## 2. Scope Verified
1. **Phase 1 — Donor CRM + Receipts**: Donor details and manual donations are org-scoped and auditable.
2. **Phase 2 — Campaign Pages + Stripe Connect**: Merchant models are enforced, webhook processing is idempotent, and donations are only written after successful webhook verification.
3. **Phase 3 — Fund Accounting Lite**: Rejects unbalanced ledger entries, enforces org boundaries on entries, and prevents updates of posted ledger records.
4. **Phase 4 — AI Concierge**: AI Concierge suggestions are written as proposals (`PENDING_REVIEW`) and cannot mutate final database state without explicit human approval.
5. **Phase 5 — Full Nonprofit Operating System**: Dynamic board packet rollup compiles CRM, campaigns, grants, compliance calendar, and volunteer impact data deterministically. MCP tools are strictly read-only or proposal-only.

---

## 3. Commands Run
- **Monorepo Tests**: `pnpm test` (successfully ran and passed all 53 test suites).
- **TypeScript Typecheck**: `pnpm run typecheck` and `npx tsc --noEmit` on web app components (0 compilation/typecheck errors).
- **Production Build**: `pnpm run build` inside `apps/web` (Next.js production build succeeded completely).
- **E2E Tool Integrations**: `npx jest --preset ts-jest --testMatch="**/*.test.ts"` inside `apps/mcp-connector` (all 12 TS E2E and tool integration tests passed successfully).

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
- **None**. All core safety, payment, accounting, and tenant isolation tests are fully passing.

---

## 12. Final Verdict
- **GREEN**: Production-ready.
