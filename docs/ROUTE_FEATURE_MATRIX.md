# Route-to-Feature Matrix

This document maps all premium routes to their required subscription features and tiers.

## Subscription Tiers

| Tier | Features |
|------|----------|
| STARTER | `compliance_calendar` |
| GROWTH | `compliance_calendar`, `grant_generator`, `restricted_funds` |
| ENTERPRISE | All keys in `@magnus/subscription` `FeatureKey` (includes `institutional_partner`) |

## Feature Keys

- `compliance_calendar` - Compliance calendar and filing management
- `grant_generator` - AI-powered grant proposal generation
- `restricted_funds` - Restricted fund tracking (deterministic tracking; not GAAP-complete accounting)
- `claude_partner` - Claude AI integration and prompt management
- `worker_financial_layer` - Worker financial tools and analysis
- `agents_layer` - MCP tools and agent integrations
- `institutional_partner` - Institutional partner portfolio, programs, and export (ENTERPRISE; partner JWT context required on partner routes)

## Route Matrix

### org-dashboard-api

Org-scoped routes use an org JWT (`orgId` in token). Partner routes additionally require `institutional_partner` on the org subscription and a valid partner context on the JWT (`partnerId`, partner role).

| Route | Method | Feature | Tier | Notes |
|-------|--------|---------|------|-------|
| `/health` | GET | None | Public | |
| `/api/org/overview` | GET | `compliance_calendar` | STARTER+ | Org JWT |
| `/api/org/compliance` | GET | `compliance_calendar` | STARTER+ | Org JWT |
| `/api/org/grants` | GET | `grant_generator` | GROWTH+ | Org JWT |
| `/api/org/990/narrative` | POST | `compliance_calendar` | STARTER+ | Org JWT |
| `/api/org/restricted-funds` | GET | `restricted_funds` | GROWTH+ | Org JWT |
| `/api/org/restricted-funds` | POST | `restricted_funds` | GROWTH+ | Org JWT |
| `/api/org/restricted-funds/:id` | GET | `restricted_funds` | GROWTH+ | Org JWT |
| `/api/org/restricted-funds/:id/drawdowns` | POST | `restricted_funds` | GROWTH+ | Org JWT |
| `/api/org/governance` | GET | `compliance_calendar` | STARTER+ | Org JWT |
| `/api/org/state-registrations` | GET | `compliance_calendar` | STARTER+ | Org JWT |
| `/api/org/state-registrations/:stateCode` | PUT | `compliance_calendar` | STARTER+ | Org JWT |
| `/api/org/state-registrations/:stateCode` | DELETE | `compliance_calendar` | STARTER+ | Org JWT |
| `/api/org/governance/policies` | PUT | `compliance_calendar` | STARTER+ | Org JWT |
| `/api/org/governance/board-members` | POST | `compliance_calendar` | STARTER+ | Org JWT |
| `/api/org/governance/board-members/:memberId` | PATCH | `compliance_calendar` | STARTER+ | Org JWT |
| `/api/org/governance/board-members/:memberId` | DELETE | `compliance_calendar` | STARTER+ | Org JWT |
| `/api/org/audit-prep` | GET | `compliance_calendar` | STARTER+ | Org JWT |
| `/api/org/audit-prep/apply-template` | POST | `compliance_calendar` | STARTER+ | Org JWT |
| `/api/org/audit-prep/items/:itemId` | PATCH | `compliance_calendar` | STARTER+ | Org JWT |
| `/api/partner/portfolio/summary` | GET | `institutional_partner` | ENTERPRISE | Partner JWT + partner context |
| `/api/partner/portfolio/export.csv` | GET | `institutional_partner` | ENTERPRISE | Partner JWT + partner context |
| `/api/partner/portfolio/orgs` | POST | `institutional_partner` | ENTERPRISE | Partner JWT; `PARTNER_ADMIN` only |
| `/api/partner/portfolio/orgs/:orgId` | PATCH | `institutional_partner` | ENTERPRISE | Partner JWT; `PARTNER_ADMIN` only |
| `/api/partner/programs` | GET | `institutional_partner` | ENTERPRISE | Partner JWT + partner context |
| `/api/partner/programs` | POST | `institutional_partner` | ENTERPRISE | Partner JWT; `PARTNER_ADMIN` only |
| `/api/partner/programs/:programId` | PATCH | `institutional_partner` | ENTERPRISE | Partner JWT; `PARTNER_ADMIN` only |
| `/api/partner/programs/:programId/summary` | GET | `institutional_partner` | ENTERPRISE | Partner JWT + partner context |

### grant-generator

| Route | Method | Feature | Tier |
|-------|--------|---------|------|
| `/health` | GET | None | Public |
| `/api/grants/generate` | POST | `grant_generator` | GROWTH+ |
| `/api/grants` | GET | `grant_generator` | GROWTH+ |
| `/api/grants/:id` | GET | `grant_generator` | GROWTH+ |
| `/api/loi/generate` | POST | `grant_generator` | GROWTH+ |

### mcp-connector

| Route | Method | Feature | Tier |
|-------|--------|---------|------|
| `/health` | GET | None | Public |
| `/api/tools` | GET | Auth only | Authenticated |
| `/api/tools/:toolName` | POST | `agents_layer` | ENTERPRISE |

### claude-partner

| Route | Method | Feature | Tier |
|-------|--------|---------|------|
| `/health` | GET | None | Public |
| `/api/claude/onboarding` | POST | `claude_partner` | ENTERPRISE |
| `/api/claude/onboard/:orgId` | POST | `claude_partner` | ENTERPRISE |
| `/api/claude/config` | GET | `claude_partner` | ENTERPRISE |
| `/api/claude/prompts` | GET | `claude_partner` | ENTERPRISE |
| `/api/claude/prompts` | POST | `claude_partner` | ENTERPRISE |
| `/api/claude/prompts/deploy` | POST | `claude_partner` | ENTERPRISE |
| `/api/claude/messages` | POST | `claude_partner` | ENTERPRISE |

### worker-financial-layer

| Route | Method | Feature | Tier | Worker Tier |
|-------|--------|---------|------|-------------|
| `/health` | GET | None | Public | - |
| `/api/worker/income-summary` | GET | `worker_financial_layer` | ENTERPRISE | FREE |
| `/api/worker/tax-estimate/basic` | GET | `worker_financial_layer` | ENTERPRISE | FREE |
| `/api/worker/income-optimizer/alerts` | GET | `worker_financial_layer` | ENTERPRISE | PREMIUM |
| `/api/worker/compensation-benchmark` | GET | `worker_financial_layer` | ENTERPRISE | PREMIUM |
| `/api/worker/volatility-analysis` | GET | `worker_financial_layer` | ENTERPRISE | PREMIUM |

### web (Next.js)

Dashboard pages rely on session/cookies; BFF routes may proxy to backend services. Partner UI is minimal and requires the same subscription and JWT shape as the API.

| Route | Method | Feature | Tier | Notes |
|-------|--------|---------|------|-------|
| `/api/health` | GET | None | Public | |
| `/api/auth/*` | * | None | Public | |
| `/api/me` | GET | Auth only | Authenticated | |
| `/api/dashboard/summary` | GET | Auth only | Authenticated | |
| `/api/partner/portfolio/export` | GET | `institutional_partner` | ENTERPRISE | Proxies CSV from org-dashboard-api; session auth |
| `/dashboard/partner/portfolio` | GET | `institutional_partner` | ENTERPRISE | Thin UI; session auth |
| `/dashboard/partner/programs` | GET | `institutional_partner` | ENTERPRISE | Thin UI; session auth |

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTH_REQUIRED` | 401 | Missing Authorization header |
| `INVALID_TOKEN` | 401 | Invalid or expired JWT |
| `FEATURE_NOT_ENABLED` | 403 | Feature not included in subscription tier |
| `SUBSCRIPTION_NOT_ACTIVE` | 403 | Subscription status is not ACTIVE |
| `WORKER_TIER_REQUIRED` | 403 | Worker tier insufficient (worker-financial-layer only) |

## Enforcement Implementation

All feature gating uses the `@magnus/subscription` package:

```typescript
import { requireFeature } from '@magnus/subscription';

// Express middleware usage
app.get('/api/route', authMiddleware, requireFeature('feature_key'), handler);
```

The middleware:

1. Validates JWT from Authorization header
2. Extracts `orgId` from verified token payload
3. Looks up org's `subscriptionTier` and `subscriptionStatus`
4. Checks if the feature is enabled for that org (tier gate, optional program-level feature grants for managed orgs, and status ACTIVE — see org feature resolution in `@magnus/subscription`)
5. Returns 401/403 on failure, calls `next()` on success

Program cohorts can attach **narrow** feature packaging to managed memberships; this is not a separate public product surface beyond the partner program and portfolio APIs above.
