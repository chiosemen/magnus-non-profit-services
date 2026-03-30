# Route-to-Feature Matrix

This document maps all premium routes to their required subscription features and tiers.

## Subscription Tiers

| Tier | Features |
|------|----------|
| STARTER | `compliance_calendar` |
| GROWTH | `compliance_calendar`, `grant_generator`, `restricted_funds` |
| ENTERPRISE | All features |

## Feature Keys

- `compliance_calendar` - Compliance calendar and filing management
- `grant_generator` - AI-powered grant proposal generation
- `restricted_funds` - Restricted fund tracking (deterministic; not full GAAP accounting)
- `claude_partner` - Claude AI integration and prompt management
- `worker_financial_layer` - Worker financial tools and analysis
- `agents_layer` - MCP tools and agent integrations

## Route Matrix

### org-dashboard-api

| Route | Method | Feature | Tier |
|-------|--------|---------|------|
| `/health` | GET | None | Public |
| `/api/org/overview` | GET | `compliance_calendar` | STARTER+ |
| `/api/org/compliance` | GET | `compliance_calendar` | STARTER+ |
| `/api/org/grants` | GET | `grant_generator` | GROWTH+ |
| `/api/org/restricted-funds` | GET/POST | `restricted_funds` | GROWTH+ |
| `/api/org/restricted-funds/:id` | GET | `restricted_funds` | GROWTH+ |
| `/api/org/restricted-funds/:id/drawdowns` | POST | `restricted_funds` | GROWTH+ |

### grant-generator

| Route | Method | Feature | Tier |
|-------|--------|---------|------|
| `/health` | GET | None | Public |
| `/api/grants/generate` | POST | `grant_generator` | GROWTH+ |
| `/api/grants` | GET | `grant_generator` | GROWTH+ |
| `/api/grants/:id` | GET | `grant_generator` | GROWTH+ |

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

| Route | Method | Feature | Tier |
|-------|--------|---------|------|
| `/api/health` | GET | None | Public |
| `/api/auth/*` | * | None | Public |
| `/api/me` | GET | Auth only | Authenticated |
| `/api/dashboard/summary` | GET | Auth only | Authenticated |

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
4. Checks if feature is enabled for that tier and status is ACTIVE
5. Returns 401/403 on failure, calls `next()` on success
