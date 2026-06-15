# Magnus Accord — commercial packages (truthful, pilot)

This document turns the **pilot launch package** into a **client-facing offering structure** without overstating implementation.

**Canonical truth sources in-repo (read these first):**

- [Pilot launch package](./MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md)
- [Feature directory](./MAGNUS_ACCORD_FEATURE_DIRECTORY.md)
- [Maturity map](./MAGNUS_ACCORD_MATURITY_MAP.md)
- [Connector registry](./MAGNUS_ACCORD_CONNECTOR_REGISTRY.md)
- [Action matrix](./MAGNUS_ACCORD_ACTION_MATRIX.md)
- [Approval traceability](./MAGNUS_ACCORD_APPROVAL_TRACEABILITY.md)
- [Production truth checklist](../PRODUCTION_TRUTH_CHECKLIST.md)
- [Client sales sheet & landing copy](./MAGNUS_ACCORD_CLIENT_SALES_SHEET.md) (truth-bound; [claim map](./MAGNUS_ACCORD_CLIENT_COPY_SOURCE_MAP.md))

---

## Packaging recommendation (keep it simple)

Offer **one strong pilot tier** as the default sale, with a clearly bounded **Enterprise expansion**.

- **Core sale:** `Magnus Accord — Assisted Ops Pilot`
- **Optional expansion:** `Magnus Accord — HQ Expansion (Enterprise)`

Do not sell “custom agent builder,” “reflection/SOLARIS,” “autonomous submission,” “audit workstation,” or “connector ecosystem” as shipped product capabilities.

---

## Package 1 — Magnus Accord: Assisted Ops Pilot (GROWTH)

### Who it is for

Nonprofits that want **internal watch + board-prep** and **operator visibility** with strict autonomy boundaries.

### Eligibility (truthful)

- Org subscription must be **ACTIVE**.
- Subscription tier must be **GROWTH** (or higher), per subscription gating for scheduled agents.
- Agents require the **agents service** deployed and enabled.
- Web surfaces require a working authenticated deployment.

### Included agents (scheduled)

- `ComplianceWatchdog` — internal compliance calendar and related **internal alerts** (STEWARD watch).
- `BoardIntelligenceOracle` — board/executive **prep** and digest-style **internal** outputs (ORACLE).

### Included staff web surfaces (`apps/web`)

- `/app/autonomous-ops/directory` — org context files + validation (templates are not “ready” until edited).
- `/app/autonomous-ops/connectors` — honest connector status view (registry + runtime where available).
- `/app/autonomous-ops/rules` — autonomy rules and subscription gates; shows org settings if configured.
- `/app/autonomous-ops/readiness` — read-only onboarding readiness status with explicit blockers.
- `/app/autonomous-ops/executive` — deterministic executive board payload (visibility, not a forecast).
- `/app/autonomous-ops/control-tower` — rollups/accountability visibility (may be labeled “Audit” in nav).

### Included connectors (client-visible vs internal-only)

Client-visible connector panels on the Connectors page:

- `claudePartner` (LIMITED) — status derived from `Organization.claudeStatus`.

Internal-only connectors that may be used by agents (not self-serve connector cards in the web app):

- `magnusHq` (LIVE) — the authoritative tenant data plane.
- `mcpConnector` — operator-only until permissions, audit redaction, rate limiting, and staging smoke are proven.
- `grantGenerator` — internal AI Concierge / grant drafting capability first.
- `workerFinancialLayer` — internal scaffold/deferred; not a public claim.
- Others as listed in the connector registry (e.g. Plaid/Candid are INTERNAL_ONLY; Slack outbound is NOT_IMPLEMENTED).

### Approval model (what you can promise)

- **Tier A only** for autonomous behavior today: internal persistence of runs, alerts, handoffs, and memory artifacts.
- **No autonomous external send/submit** (email, Slack, filing, grant submission) and **no money movement**.
- “Ask-first” approval UX for external actions is **not included** in the pilot product.
- “Human review” exists as flags and auditable workflow evidence (handoff audit trail), not an external authorization system.

### Audit and visibility (what you can promise)

- **Visibility and rollups** in the web app (executive + control tower).
- Append-only audit trails exist for handoffs and alerts in APIs, but there is **no** full browser “audit workstation” UI and **no** export pack.

### Explicit exclusions (do not market as included)

- Reflection / SOLARIS synthesis agent (not implemented).
- Autonomous outbound communications or submissions.
- A dedicated handoff inbox / triage UI in the web app.
- Donor/volunteer ledger staff UIs in `apps/web` (APIs may exist separately).
- “Production connector ecosystem” (MCP/grant-generator/worker-financial are internal-only or deferred; many connectors are internal-only).

### Required caveats (must be in the offer)

- “Internal outputs only; humans retain authority over anything external or irreversible.”
- “MCP, grant-generator, and worker-financial are not self-serve public connector products.”
- “Some deep links are placeholders; value is visibility, not a complete workflow UI for every action.”

---

## Package 2 — Magnus Accord: HQ Expansion (Enterprise)

This is an **add-on**, not a “fully mature tier.” It adds real agents but is **configuration- and data-dependent**.

### Eligibility

- Org subscription: **ACTIVE**
- Tier: **ENTERPRISE**
- Agents service deployed/enabled.

### Adds agents (scheduled)

Adds to Assisted Ops Pilot:

- `FinancialSentinel` — internal financial/grant pace **alerts only** (no money movement).
- `GrantLifecycleManager` — internal grant lifecycle monitoring signals.
- `GrantIntelligenceHerald` — bounded grant intelligence and prep; **no autonomous submission**.

### Connector/data caveats (must be explicit)

- Outcomes can be **NOT_CONFIGURED** or **INSUFFICIENT_DATA** until prerequisites exist (API keys, connector configuration, data volume).
- This add-on does not introduce external approvals or autonomous submissions.

---

## What not to market yet (hard “no” list)

- “Custom agent builder” (self-serve product) as shipped functionality.
- “Reflection” / SOLARIS synthesis.
- Autonomous submission, filings, or external send on behalf of the org.
- Money movement or authoritative write-back to external ledgers.
- MCP-driven compliance/finance truth or public MCP beta exposure.
- Volunteer roster/in-kind valuation/scheduling as a product truth claim.
- Web audit workstation and audit export packs.

---

## Offer name summary (recommended)

- **Magnus Accord — Assisted Ops Pilot** (default commercial offer)
- **Magnus Accord — HQ Expansion (Enterprise)** (add-on)
