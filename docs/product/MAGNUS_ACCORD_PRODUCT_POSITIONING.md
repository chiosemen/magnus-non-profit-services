# Magnus Accord — product positioning

This document is the **canonical client-readable framing** for Magnus Accord in this repository. It does not replace technical specs or deploy gates; it explains **what the product is**, **what a pilot launch includes**, and **what is not promised**.

Technical depth lives in the linked docs below. Operator deploy truth lives in the production checklist.

**Related:** [Commercial packages](./MAGNUS_ACCORD_PACKAGES.md) · [Client feature matrix](./MAGNUS_ACCORD_CLIENT_FEATURE_MATRIX.md) · [Pilot launch package](./MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md) · [Feature directory](./MAGNUS_ACCORD_FEATURE_DIRECTORY.md) · [Connector registry](./MAGNUS_ACCORD_CONNECTOR_REGISTRY.md) · [Action matrix](./MAGNUS_ACCORD_ACTION_MATRIX.md) · [Maturity map](./MAGNUS_ACCORD_MATURITY_MAP.md) · [Autonomous Ops roadmap](../AUTONOMOUS_OPS_ROADMAP.md) · [Production truth checklist](../PRODUCTION_TRUTH_CHECKLIST.md) · [Handoff and memory](../AUTONOMOUS_OPS_HANDOFF_AND_MEMORY.md) · [Volunteer operations status](../AUTONOMOUS_OPS_VOLUNTEER_STATUS.md)

---

## What Magnus Accord is

Magnus Accord is a **bounded nonprofit operations layer**: software and scheduled **internal** agents **watch, draft, flag, and prepare** work—compliance signals, grant and financial watch (alerts only), board-oriented prep, and durable org context. **People keep authority** over anything **external or irreversible** (sending on behalf of the org, filing, submissions, moving money, changing authoritative external records).

Today, autonomous agent behavior in code is **Tier A only**: agents persist runs, alerts, handoffs, and internal artifacts; they **do not** autonomously send email, file government forms, or submit grants on your behalf. See autonomy tiers in the [roadmap](../AUTONOMOUS_OPS_ROADMAP.md).

---

## What the launch package is

The **launch package** is an **operational** definition for a pilot tenant—not a marketing bundle.

It includes, when you intend to run Autonomous Ops end-to-end:

1. **Postgres** with migrations applied to the schema expected by this repo.
2. **`org-dashboard-api`** deployed with valid environment variables (fail-closed startup) and reachable **smoke routes** as described in the [production truth checklist](../PRODUCTION_TRUTH_CHECKLIST.md).
3. **`apps/agents`** deployed **only if** you want scheduled agent runs; it requires its own env validation, database access, and typically `AGENTS_ENABLED` (or equivalent operational choice) plus subscription eligibility per org.
4. **Web app** (`apps/web`) as the **authenticated** shell for staff (pilot-labeled in the protected app), consuming backend APIs—not as a substitute for API and DB truth.

**Important:** The launch package **does not** imply public exposure for the **MCP Connector**, a standalone **Grant Generator**, or the **Worker Financial Layer**. MCP is internal/operator-only, grant drafting sits under AI Concierge first, and worker financial remains deferred/scaffolded.

---

## What is live now

Subject to **correct deployment**, **migrations**, **entitlements** (subscription tier and active status), and **configuration**:

- **Org-scoped APIs** for overview, compliance calendar, grants, Autonomous Ops identity files, handoffs, operational and curated memory, control-tower summary, alert lifecycle, obligations, donor events, volunteer events, and related executive payloads—as implemented in `org-dashboard-api` and consumed by the web app where wired.
- **Scheduled agents** (when the agents service is enabled and policy allows): compliance watch, board intelligence, financial sentinel (internal alerts), grant lifecycle manager, grant intelligence herald, and worker-scoped income optimizer—see [maturity map](./MAGNUS_ACCORD_MATURITY_MAP.md) for maturity labels.
- **Web Autonomous Ops surfaces**: directory and memory, connectors (honest status), authority rules, executive views, control tower rollups—see maturity map.

**Deploy health** is not inferred from this document. Use the [production truth checklist](../PRODUCTION_TRUTH_CHECKLIST.md) (env validation, schema verification, smoke routes).

---

## What is pilot-only

- In the **connectors** product view, only client-visible connector panels should render. MCP, Grant Generator, and Worker Financial Layer remain internal/deferred and are not public beta panels.
- The **protected web app** carries an explicit **pilot** indicator on the shell—meaning **surface and program maturity**, not “all backends are incomplete.”
- Any environment that still relies on **MCP demo/stub paths** for compliance, financial, or worker narratives must **not** be described to clients as production financial or compliance truth.

---

## What is later

- Roadmap **stages 3–4** items: stronger commercial packaging, portfolio-grade executive synthesis, and related UX—not fully specified here; see [roadmap stages](../AUTONOMOUS_OPS_ROADMAP.md).
- **Reflection / synthesis persona (SOLARIS)** and similar: **not implemented** in the agent set today.
- **True semantic / vector retrieval** for Tier 3 memory: storage exists; search behavior is **keyword-based** until an embedding pipeline is implemented—see [handoff and memory](../AUTONOMOUS_OPS_HANDOFF_AND_MEMORY.md).

---

## What is explicitly not offered yet (autonomous product)

The platform **does not** offer, as autonomous agent behavior without human authority:

- Autonomous **outbound email** or messaging on behalf of the org.
- Autonomous **grant submission** or **government filing**.
- **Moving money** or mutating **authoritative** external financial systems.
- Exposing **MCP tools** as public beta or treating MCP outputs as **production** compliance or financial records.

Near-term **non-goals** called out in the roadmap (e.g. certain memory and comms patterns) remain in force—see [roadmap non-goals](../AUTONOMOUS_OPS_ROADMAP.md).

---

## Client-facing vs internal language

**We use client-readable terms** in this doc: obligations, alerts, handoffs, connectors, pilot, launch package.

**We intentionally omit** from client-facing promises: internal type and module keys, raw API path strings as the primary explanation, implementation flags like “unimplemented in repo,” and deep file paths—except where **operators** need a command or checklist reference (e.g. schema verification in the production checklist).

---

## GO / NO-GO for “launch package definition”

- **GO** to **define** the pilot launch package as: migrated database + fail-closed services + optional agents service + authenticated web + explicit pilot boundaries for connectors and MCP truth—as this document and the checklist describe.
- **NO-GO** to treat **documentation alone** as production sign-off: you still need successful env validation, schema verification (`pnpm --filter @magnus/db verify:schema` when using that gate), and smoke checks appropriate to your environment.
