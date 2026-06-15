# Magnus Accord — connector capability registry

This document is the **human-readable mirror** of the canonical code registry in `@magnus/org-autonomous-ops-context` (`connectorRegistry.ts`). If this file and code disagree, **code wins** until this doc is updated.

**Related:** [Action matrix](./MAGNUS_ACCORD_ACTION_MATRIX.md) (autonomy by action class) · [Pilot launch package](./MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md) · [Feature directory](./MAGNUS_ACCORD_FEATURE_DIRECTORY.md) · [Maturity map](./MAGNUS_ACCORD_MATURITY_MAP.md) · [Production truth checklist](../PRODUCTION_TRUTH_CHECKLIST.md)

---

## Maturity labels

| Label | Meaning |
|--------|---------|
| **LIVE** | Implemented for intended use; deployment and entitlements may still apply. |
| **LIMITED** | Implemented but narrowed (e.g. ops-dependent activation or partial UX). |
| **PILOT** | Pilot-scoped; may lack DB-backed product state or include stub paths elsewhere. |
| **INTERNAL_ONLY** | Used by agents or APIs; **not** a self-serve connector card in the web app. |
| **NOT_IMPLEMENTED** | Not present in canonical tree for this capability. |

## Action kinds

Actions describe **intent**, not a full permission system. **`requiresApproval: true`** means a **human** must approve before that class of action may affect the org **externally** or as an **authoritative** record (Tier B/C style). Agents today operate at **Tier A** for autonomous side effects ([roadmap](../AUTONOMOUS_OPS_ROADMAP.md)).

---

## Registry summary (all connector keys)

| Connector key | Display name | Maturity | Client-visible UI | Pilot-only row | Notes |
|---------------|--------------|----------|-------------------|----------------|--------|
| `magnusHq` | Magnus HQ (database and org APIs) | LIVE | No | No | Authoritative tenant data plane. |
| `claudePartner` | Claude Partner API | LIMITED | Yes | No | Status from `Organization.claudeStatus`. |
| `mcpConnector` | MCP Connector | INTERNAL_ONLY | No | No | Operator-only until permissions, audit redaction, rate limiting, and staging smoke are proven. |
| `grantGenerator` | Grant Generator | INTERNAL_ONLY | No | No | Internal AI Concierge capability first; not a standalone public connector. |
| `workerFinancialLayer` | Worker Financial Layer | INTERNAL_ONLY | No | No | Internal scaffold/deferred; public surfaces must omit or return `FEATURE_NOT_CONFIGURED`. |
| `plaidFinancialWatch` | Plaid (FinancialSentinel) | INTERNAL_ONLY | No | No | Read + internal alerts only. |
| `candidGrantIntelligence` | Candid (GrantIntelligenceHerald) | INTERNAL_ONLY | No | No | Read + internal prep/alerts. |
| `stripeDonorLinkage` | Stripe (org donor linkage) | LIMITED | No | No | Donor-ops signals; not full CRM UI. |
| `slackOutboundAlerts` | Slack (outbound agent alerts) | NOT_IMPLEMENTED | No | No | No Slack sink in canonical `apps/agents`. |

---

## Client-visible panels (web)

The Autonomous Ops **Operating Doors** page renders **`claudePartner`** using `buildClientConnectorPanels()` plus runtime status from the database. MCP, Grant Generator, and Worker Financial Layer remain in the registry for operator/internal planning but are not client-visible panels.

---

## Required reading for operators

- **MCP:** Internal/operator-only. Do not expose publicly or treat as production financial/compliance truth until tool permissions, audit redaction, rate limiting, and staging smoke are proven.
- **Deploy health:** Registry maturity does not imply migrations or env validation passed.

---

## Maintenance

When adding a connector:

1. Add an entry to `packages/org-autonomous-ops-context/src/connectorRegistry.ts`.
2. Export if needed; extend `CLIENT_CONNECTOR_PANEL_KEYS` only when the web UI should show it.
3. Update this markdown table and [feature directory](./MAGNUS_ACCORD_FEATURE_DIRECTORY.md) if pilot boundaries change.
