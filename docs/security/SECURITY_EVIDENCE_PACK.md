# Magnus Accord Security Evidence Pack

**Version:** 1.0
**Date:** 2026-04-13
**Classification:** Pilot/Staging Verification Evidence

## Executive Summary

This document provides security evidence for staged review. It is not a production approval; current release claims must defer to the P0 hardening baseline.

---

## 1. Authentication Architecture

### 1.1 Web Authentication (apps/web)

| Control | Implementation | Evidence |
|---------|----------------|----------|
| Session Management | JWT in HttpOnly cookie | `apps/web/src/app/api/auth/login/route.ts` |
| Session Binding | CAS (Compare-and-Swap) rotation | Prevents session fixation |
| CSRF Protection | Custom header + Origin validation | `apps/web/src/lib/csrf.ts` |
| Rate Limiting | Redis-capable (falls back with warning) | `apps/web/src/lib/rate-limit.ts` |

**CSRF Enforcement:**
```typescript
// apps/web/src/lib/csrf.ts
// Requires X-Magnus-CSRF: 1 header on all mutations
// Validates Origin/Referer against NEXT_PUBLIC_APP_URL
// Fails closed if app URL not configured
```

### 1.2 MCP Authentication (apps/mcp-connector)

| Control | Implementation | Evidence |
|---------|----------------|----------|
| Token Validation | JWT with issuer/audience check | `apps/mcp-connector/src/auth/TokenValidator.ts` |
| Central AuthZ | EIN-to-org relationship check | `apps/mcp-connector/src/server.ts:103-134` |
| Audit Trail | All tool calls logged to Prisma | `apps/mcp-connector/src/audit/AuditLogger.ts` |

**Central Authorization Check:**
```typescript
// apps/mcp-connector/src/server.ts
async function checkEINAuthorization(userId: string, requestedEin: string): Promise<boolean> {
  const profile = await workerService.getMultiOrgProfile(userId);
  return profile.organizations.some(o => o.ein === requestedEin);
}
// Returns 403 FORBIDDEN_EIN if unauthorized
```

---

## 2. Multi-Tenant Isolation

### 2.1 Organization Scoping

| Layer | Isolation Mechanism | Evidence |
|-------|---------------------|----------|
| Database | Prisma org-scoped queries | All queries include `orgId` filter |
| MCP Tools | EIN authorization gate | `server.ts:128-134` |
| Worker Data | `workerOrgRelationship` table | `WorkerService.ts:166-200` |

**WorkerService Prisma Query:**
```typescript
// apps/mcp-connector/src/services/WorkerService.ts
const relationships = await prisma.workerOrgRelationship.findMany({
  where: { workerId: userId },
  include: { organization: true }
});
// No in-memory fallback, no seed data
```

### 2.2 Cross-Tenant Attack Vectors (Mitigated)

| Vector | Mitigation | Test Coverage |
|--------|------------|---------------|
| IDOR via EIN | Central `checkEINAuthorization()` | `e2e-mcp-auth.test.ts` |
| Session leakage | Org-scoped JWT claims | Token includes `orgId` |
| Data enumeration | Fail-closed NotFoundError | `WorkerService.ts:97-101` |

---

## 3. Input Validation and Injection Prevention

### 3.1 Validation Boundaries

| Layer | Validation | Evidence |
|-------|------------|----------|
| API Routes | Zod schemas | Throughout API handlers |
| Env Config | Zod validation at startup | `packages/config/src/env.ts` |
| MCP Params | Tool-specific Zod schemas | Each tool in `apps/mcp-connector/src/tools/` |

### 3.2 Injection Mitigations

| Type | Prevention | Notes |
|------|------------|-------|
| SQL Injection | Prisma ORM (parameterized) | No raw SQL |
| XSS | React auto-escaping + CSP | `next.config.js` |
| Prompt Injection | No user input in LLM prompts | `PlaidMCPClient.ts` uses direct HTTP |
| Command Injection | No shell execution | All operations via typed APIs |

---

## 4. Security Headers

All headers configured in `apps/web/next.config.js`:

```javascript
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'; ...
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

---

## 5. Cryptographic Controls

### 5.1 Field-Level Encryption

| Control | Implementation | Evidence |
|---------|----------------|----------|
| Algorithm | AES-256-GCM | `packages/db/src/encryptionExtension.ts` |
| Key Management | Env var (64 hex chars) | `ENCRYPTION_KEY` |
| Protected Fields | `plaidAccessToken`, `ssnEncrypted` | Line 70 |

**Encryption Enforcement:**
```typescript
// packages/db/src/encryptionExtension.ts
if (!key || key.length !== 64) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string in production');
  }
}
```

### 5.2 Secret Hygiene

| Control | Status | Evidence |
|---------|--------|----------|
| No hardcoded secrets | Verified | `PlaidMCPClient.ts` uses `env.JWT_SECRET` |
| Secret scanning | CI enabled | `.github/workflows/ci.yml` - TruffleHog |
| Env validation | Fail-closed | `packages/config/src/env.ts` |

---

## 6. Agent Safety Controls

### 6.1 Per-Agent Kill Switches

| Agent | Env Variable | Default |
|-------|--------------|---------|
| Compliance Watchdog | `AGENT_ENABLE_COMPLIANCE_WATCHDOG` | undefined (off) |
| Grant Manager | `AGENT_ENABLE_GRANT_MANAGER` | undefined (off) |
| Financial Sentinel | `AGENT_ENABLE_FINANCIAL_SENTINEL` | undefined (off) |
| Board Oracle | `AGENT_ENABLE_BOARD_ORACLE` | undefined (off) |
| Grant Herald | `AGENT_ENABLE_GRANT_HERALD` | undefined (off) |
| Worker Income Optimizer | `AGENT_ENABLE_WORKER_INCOME_OPTIMIZER` | undefined (off) |

### 6.2 External Communication Boundary

```typescript
// apps/agents/src/agents/boardIntelligenceOracle/BoardIntelligenceOracle.ts
if (process.env.ORACLE_ALLOW_EXTERNAL_SEND !== 'true') {
  throw new Error('External send not authorized');
}
// Default: agents cannot send external communications
```

---

## 7. Feature Flags and Gating

### 7.1 Production Feature Gates

| Feature | Flag | Fail Behavior |
|---------|------|---------------|
| Worker Financials | `FEATURE_FLAG_WORKER_FINANCIALS` | 503 FEATURE_NOT_CONFIGURED |
| MCP Live | `FEATURE_FLAG_MCP_LIVE` | Routes disabled |
| Mobile Auth | `FEATURE_FLAG_MOBILE_AUTH` | Auth routes disabled |

### 7.2 Testing Configuration

For pentest, set these flags:
```bash
# Enable core features
FEATURE_FLAG_MCP_LIVE=true
AGENTS_ENABLED=false  # Keep agents off during pentest

# Required secrets
JWT_SECRET=<32+ chars>
ENCRYPTION_KEY=<64 hex chars>
REDIS_URL=redis://...
NEXT_PUBLIC_APP_URL=https://...
```

---

## 8. Known Limitations

### 8.1 Out of Scope for This Audit

| Item | Reason |
|------|--------|
| Mobile app | Not yet production-ready |
| Worker financial layer | Feature-flagged off |
| Clerk/Google OAuth | Custom JWT auth used instead |

### 8.2 Accepted Risks

| Risk | Mitigation | Residual |
|------|------------|----------|
| Memory rate-limit fallback | Loud warning logged | Single-instance scenario |
| Dev encryption fallback | Production fails closed | Dev-only |

---

## 9. Test Evidence

### 9.1 Security-Focused Tests

| Test Suite | Location | Coverage |
|------------|----------|----------|
| MCP E2E Auth | `apps/mcp-connector/__tests__/e2e-mcp-auth.test.ts` | JWT validation, tool execution |
| Web Auth | `apps/web/src/tests/wave5-auth-bff.test.ts` | CSRF, session binding |
| Encryption | `packages/db/src/tests/encryptionExtension.test.ts` | Encrypt/decrypt, format |
| Schema Guards | `packages/db/src/tests/schemaGuards.test.ts` | Fail-closed DB checks |

### 9.2 CI Security Checks

```yaml
# .github/workflows/ci.yml
- name: Secret Scan
  uses: trufflesecurity/trufflehog@main
```

---

## 10. Contact and Scope

### Authorized Testing Scope

- Web application: `apps/web` (Next.js)
- MCP API: `apps/mcp-connector` (Express)
- Org Dashboard API: `apps/org-dashboard-api` (Express)

### Out of Scope

- Direct database access (Neon PostgreSQL)
- Infrastructure layer (Railway/Vercel)
- Third-party integrations (Plaid, Stripe)

### Security Contact

For vulnerability disclosure: security@magnus-accord.com (example)
