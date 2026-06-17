# Magnus Accord — client feature matrix (truthful, pilot)

This matrix is for **commercial packaging and client-facing statements**. It maps what is **actually usable** in the pilot web app vs API/internal-only surfaces.

**Canon:** if this matrix disagrees with [Pilot launch package](./MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md), [Feature directory](./MAGNUS_ACCORD_FEATURE_DIRECTORY.md), or [Maturity map](./MAGNUS_ACCORD_MATURITY_MAP.md), treat this file as out of date until corrected.

Legend:

- **Included**: in scope for the named package.
- **Available (with caveats)**: implemented but constrained or configuration/data-dependent; must be caveated.
- **Pilot-only**: explicitly pilot-labeled surface or connector row; not a production-ready claim.
- **Internal/API only**: implemented but not a first-class client web experience.
- **Not supported**: not implemented in repo or explicitly excluded.

---

## Packages

- **Starter:** Donor CRM, basic campaigns, receipts/manual records, basic compliance checklist.
- **Growth:** Stripe Connect campaign payments, fund accounting lite, compliance reminders, limited AI Concierge, board packet drafts.
- **Enterprise:** Advanced AI/board workflows, grant drafting pilot, custom compliance/reporting, and scheduled HQ Expansion agents where configured.

---

## Agents (scheduled)

| Capability | P1 | P2 | Notes |
| --- | --- | --- | --- |
| `ComplianceWatchdog` | Included | Included | Internal alerts only; requires ACTIVE subscription + agents service deployed. |
| `BoardIntelligenceOracle` | Included | Included | Emits board/executive prep as internal artifacts; will flag incomplete org context. |
| `FinancialSentinel` | Not supported | Available (with caveats) | Internal alerts only; ENTERPRISE only; data/config dependent. |
| `GrantLifecycleManager` | Not supported | Available (with caveats) | ENTERPRISE only; internal monitoring. |
| `GrantIntelligenceHerald` | Not supported | Available (with caveats) | ENTERPRISE only; bounded prep; requires org identity inputs; no submission. |
| “Worker income optimizer” (`WorkerIncomeOptimizer`) | Not supported | Not supported | Worker-scoped internal scaffold; not scheduled by nonprofit subscription tier. |
| Reflection / SOLARIS | Not supported | Not supported | Not implemented. |

---

## Staff web surfaces (`apps/web`)

| Surface | P1 | P2 | Notes |
| --- | --- | --- | --- |
| Directory & org context | Included | Included | Templates auto-seed; validation report explains required vs optional. |
| Connectors (“Operating Doors”) | Included | Included | Claude status from DB; MCP/grant-gen/worker-financial are internal and not client-visible panels. |
| Authority Rules | Included | Included | Visibility of autonomy settings; not a full config editor. |
| Readiness dashboard | Included | Included | Truthful `NOT_CONFIGURED/PARTIAL/READY` with blockers. |
| Executive | Included | Included | Visibility and deterministic rollups; not a forecast and not a task UI for everything. |
| Control tower / accountability | Included | Included | Rollups and visibility; may be labeled “Audit” but is not an audit workstation. |
| Alert lifecycle workstation UI | Not supported | Not supported | API exists; no full pilot UI. |
| Handoff inbox / triage UI | Not supported | Not supported | API exists; rollups exist; no pilot inbox UI. |
| Donor ledger UI | Not supported | Not supported | API exists on org-dashboard-api; no web UI. |
| Volunteer ledger UI | Not supported | Not supported | API exists on org-dashboard-api; no web UI. |

---

## Connectors (client-visible panels)

| Connector panel | P1 | P2 | Notes |
| --- | --- | --- | --- |
| Claude Partner (`claudePartner`) | Available (with caveats) | Available (with caveats) | Status from `Organization.claudeStatus`. Enablement requires correct deployment/config; only `ACTIVE` is truly enabled. |
| MCP Connector (`mcpConnector`) | Internal/operator-only | Internal/operator-only | Do not expose publicly until permissions, audit redaction, rate limiting, and staging smoke are proven. |
| Grant Generator (`grantGenerator`) | Internal AI Concierge capability | Internal AI Concierge capability | Not a standalone public app or connector product. |
| Worker Financial Layer (`workerFinancialLayer`) | Not public | Not public | Internal scaffold/deferred; worker-scoped sensitivity. |

Internal-only connectors are governed by the connector registry and action matrix; they are not “self-serve connector cards” in the pilot web app.

---

## Approval & autonomy model (client-facing truth)

| Item | P1 | P2 | Notes |
| --- | --- | --- | --- |
| Autonomous internal side effects (Tier A) | Included | Included | Runs, alerts, handoffs, memory artifacts. |
| External “ask-first approvals” UX | Not supported | Not supported | No dedicated approve/reject workflow UI in the pilot web app. |
| Autonomous external send/submit | Not supported | Not supported | Always forbidden in pilot packaging. |
| Evidence/audit traceability for handoffs | Available (with caveats) | Available (with caveats) | Append-only audit exists; no full UI workstation; do not call it “external authorization.” |

---

## Audit & accountability

| Capability | P1 | P2 | Notes |
| --- | --- | --- | --- |
| Rollups and visibility | Included | Included | Control tower + executive surfaces. |
| Per-item audit workstation UI | Not supported | Not supported | APIs exist; not a full product UI. |
| Export audit pack | Not supported | Not supported | Explicitly excluded. |

---

## Explicit exclusions (all packages)

- Autonomous outbound email/messaging, filing, grant submission, money movement, or write-back to authoritative external ledgers.
- “Custom agent builder” as a self-serve product.
- Reflection / SOLARIS synthesis agent.
- MCP tools or worker financial layer as public beta features.
- Volunteer roster/in-kind valuation/scheduling as ledger truth.
