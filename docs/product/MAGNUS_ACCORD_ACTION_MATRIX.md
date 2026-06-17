# Magnus Accord — action classification matrix (connectors)

This document defines **action classes** and, for each **connector**, which classes are **allowed autonomously**, **ask-first only**, **never** (for autonomous agents), or **not supported** by that connector.

**Canonical code:** `packages/org-autonomous-ops-context/src/accordActionMatrix.ts` (`ACCORD_CONNECTOR_ACTION_MATRIX`, `getConnectorActionPolicy`, `isAutonomousActionAllowed`).

**Related:** [Connector registry](./MAGNUS_ACCORD_CONNECTOR_REGISTRY.md) · [Autonomous Ops roadmap](../AUTONOMOUS_OPS_ROADMAP.md) (Tier A–C) · [Product positioning](./MAGNUS_ACCORD_PRODUCT_POSITIONING.md)

---

## Action classes (glossary)

| Class (code key) | Client-readable meaning |
|------------------|-------------------------|
| `observe_read` | Read or pull data (API, DB, model context) without mutating an external system of record. |
| `internal_draft` | Produce draft artifacts that stay inside Magnus (memory, alerts body, handoff text, grant draft in app). |
| `internal_notify` | Surface signals inside the product (e.g. alerts, dashboard) without outbound email/Slack as the channel. |
| `internal_escalate` | Create or route internal escalation records (e.g. handoffs, high-severity internal items). |
| `external_draft` | Draft content **intended** for an external channel (email body, filing text) before human release. |
| `external_send` | Send on behalf of the org (email, Slack message, SMS, etc.). |
| `external_submit` | Submit to an external authority (grant portal, government e-file). |
| `data_write_back` | Persist changes to an **external** system (CRM, bank ledger as authoritative, etc.). |
| `irreversible_action` | Destructive or binding operations (money movement, irreversible delete, contract bind). **Autonomous agents: always forbidden.** |

---

## Policy bands

| Band | Meaning for **autonomous** agents |
|------|-----------------------------------|
| **AUTONOMOUS** | May run without a dedicated human approval step for that action class, subject to org `AutonomyTier` caps and implemented code paths. |
| **ASK_FIRST** | Must not run autonomously; explicit human approval required before execution on behalf of the org. |
| **NEVER** | Autonomous execution is **not** allowed. (Humans may still perform the action outside agent automation.) |
| **NOT_SUPPORTED** | The connector does not implement this action class. |

---

## Current enforcement vs target matrix

### Current (today)

- Agents enforce **coarse** autonomy via `AutonomyTier` (`TIER_A_AUTONOMOUS`, `TIER_B_ASK_FIRST`, `TIER_C_NEVER`) and `requiresHumanReview`, plus **`assertInternalSideEffectAllowed`** for a **narrow** set of internal effects (`handoff`, `memory`) in [`apps/agents/src/autonomy/enforcement.ts`](../../apps/agents/src/autonomy/enforcement.ts).
- There is **no** runtime check that maps `(connectorKey, actionClass)` to the matrix below on every path.
- Org settings cap `maxAutonomyTier` via [`AutonomousOpsSettingsService`](../../packages/org-autonomous-ops-context/src/autonomySettingsService.ts) / scheduler boundary stamping.

**Plain language:** the matrix is the **target governable contract**; wiring it into every agent and tool call is **future work**.

### Target (this document + `accordActionMatrix.ts`)

- Product, security review, and implementations should align outbound and write-back behavior with the table below.
- Use `getConnectorActionPolicy({ connectorKey, actionClass })` when adding enforcement hooks.

### Irreversible actions (non-ambiguous)

For **every** connector in the registry, **`irreversible_action` is `NEVER` for autonomous agents**. There is no `ASK_FIRST` or `AUTONOMOUS` band for irreversible work in this matrix.

---

## Matrix by connector

Legend: **A** = AUTONOMOUS, **Q** = ASK_FIRST, **N** = NEVER, **—** = NOT_SUPPORTED

### magnusHq (Postgres + org APIs)

| Class | Band | Notes |
|-------|------|--------|
| observe_read | A | Authenticated reads. |
| internal_draft | A | Org files, curated memory, internal text. |
| internal_notify | A | Alerts and in-app signals. |
| internal_escalate | A | Handoffs and similar. |
| external_draft | N | Not performed autonomously by agents via HQ alone. |
| external_send | N | |
| external_submit | N | |
| data_write_back | — | HQ does not mean “push to Salesforce.” |
| irreversible_action | N | |

### claudePartner

| Class | Band | Notes |
|-------|------|--------|
| observe_read | A | Model inference when integration active. |
| internal_draft | A | Internal completions. |
| internal_notify | — | |
| internal_escalate | — | |
| external_draft | Q | Any draft destined for external use needs human gate. |
| external_send | N | |
| external_submit | N | |
| data_write_back | — | |
| irreversible_action | N | |

### mcpConnector (internal/operator-only)

| Class | Band | Notes |
|-------|------|--------|
| observe_read | Q | Internal/operator-only until tool permissions, audit redaction, rate limiting, and staging smoke are proven. |
| internal_draft | Q | |
| internal_notify | — | |
| internal_escalate | — | |
| external_draft | N | |
| external_send | N | |
| external_submit | N | |
| data_write_back | N | Too risky with stub/demo behavior. |
| irreversible_action | N | |

### grantGenerator (internal AI Concierge capability)

| Class | Band | Notes |
|-------|------|--------|
| observe_read | A | Read context for drafting. |
| internal_draft | A | Assistive draft inside AI Concierge / grants workflow; not standalone public app. |
| internal_notify | — | |
| internal_escalate | — | |
| external_draft | Q | LOI / proposal text for external use. |
| external_send | N | |
| external_submit | N | No autonomous submission. |
| data_write_back | — | |
| irreversible_action | N | |

### workerFinancialLayer (internal scaffold / deferred)

| Class | Band | Notes |
|-------|------|--------|
| observe_read | Q | Internal scaffold; worker-scoped sensitivity. |
| internal_draft | Q | |
| internal_notify | — | |
| internal_escalate | — | |
| external_draft | N | |
| external_send | N | |
| external_submit | N | |
| data_write_back | N | |
| irreversible_action | N | |

### plaidFinancialWatch (FinancialSentinel)

| Class | Band | Notes |
|-------|------|--------|
| observe_read | A | Read balances/transactions for watch. |
| internal_draft | — | |
| internal_notify | A | Internal alerts. |
| internal_escalate | A | Alert-driven attention. |
| external_draft | N | |
| external_send | N | |
| external_submit | N | |
| data_write_back | — | Sentinel path is read/watch, not Plaid write. |
| irreversible_action | N | |

### candidGrantIntelligence (GrantIntelligenceHerald)

| Class | Band | Notes |
|-------|------|--------|
| observe_read | A | Opportunity fetch when configured. |
| internal_draft | A | HERALD internal packets. |
| internal_notify | A | Alerts. |
| internal_escalate | A | Handoffs when created. |
| external_draft | Q | Any artifact intended for a funder portal. |
| external_send | N | |
| external_submit | N | |
| data_write_back | — | |
| irreversible_action | N | |

### stripeDonorLinkage

| Class | Band | Notes |
|-------|------|--------|
| observe_read | A | Linkage / config visibility. |
| internal_draft | — | |
| internal_notify | — | |
| internal_escalate | — | |
| external_draft | N | |
| external_send | N | |
| external_submit | N | |
| data_write_back | Q | Appending donor ledger / authoritative payment-side writes need human-controlled flows. |
| irreversible_action | N | |

### slackOutboundAlerts (not implemented in canonical agents)

| Class | Band | Notes |
|-------|------|--------|
| observe_read through data_write_back (operational) | — | No Slack integration in canonical `apps/agents`. |
| external_send | N | Autonomous outbound Slack is forbidden even if a sink were added without policy. |
| external_submit | N | |
| irreversible_action | N | |

---

## Mapping from connector registry “actions”

The [connector registry](./MAGNUS_ACCORD_CONNECTOR_REGISTRY.md) uses coarse `ConnectorActionKind` (`read`, `draft`, …). Those describe **marketing/UX** capability lines. This matrix is the **governance** view: use action **classes** above for autonomy policy.

---

## Maintenance

When adding a connector to `connectorRegistry.ts`, add a full row to `ACCORD_CONNECTOR_ACTION_MATRIX` and extend tests in `accordActionMatrix.test.ts`.
