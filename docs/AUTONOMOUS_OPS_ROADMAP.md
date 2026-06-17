# Magnus Accord Autonomous Ops

Autonomous Ops is a **bounded** nonprofit operations layer: agents **draft, monitor, flag, and prepare** work continuously. Humans keep authority over **external and irreversible** actions. This is not “AI does everything” and not chat-first product positioning.

**Canonical code:** this repository (`magnus-local`). Stable agent names persisted in `AgentRun.agentName` may differ from roadmap persona labels; see [Personas vs implementation](#personas-vs-implementation).

**Related:** handoff and memory primitives are specified in [AUTONOMOUS_OPS_HANDOFF_AND_MEMORY.md](./AUTONOMOUS_OPS_HANDOFF_AND_MEMORY.md).

---

## Stages and exit criteria

| Stage | Focus | Exit criteria (summary) |
|-------|--------|-------------------------|
| **0 — Foundation** | Repo truth, CI, honest release scope, workflow surfaces callable by agents | One spine; docs match code; core surfaces stable enough for agent reads |
| **1 — Internal autonomous prep** | Internal alerts, memos, drafts, dashboard-oriented outputs, task prep, escalation | Scheduled runs; useful outputs without constant prompting; **autonomy boundaries enforced**; **audit trail** for outputs |
| **2 — Memory + handoff** | Inbox/handoff, org identity files, tiered memory, reflection | Safe agent-to-agent handoffs; durable org context; periodic synthesis possible |
| **3 — Commercial packaging** | Onboarding, visible controls, heartbeats, deliverables | Repeatable onboarding; staff trust; clear service boundary |
| **4 — Executive / portfolio** | Rollups, source-linked synthesis | Grounded summaries; confidence/coverage signals |

---

## Personas vs implementation

| Roadmap persona | Role | Stable `agentName` in code |
|-----------------|------|----------------------------|
| STEWARD | Compliance orchestrator | `ComplianceWatchdog` |
| ORACLE | Board / executive prep | `BoardIntelligenceOracle` |
| HERALD | Grant intelligence (bounded) | `GrantLifecycleManager` |
| SENTINEL | Financial watch (conservative) | `FinancialSentinel` |
| SOLARIS | Reflection / synthesis | *Stage 2+ — not implemented yet* |

`WorkerIncomeOptimizer` is an internal worker-scoped scaffold; it is **outside** the Autonomous Ops persona set for v1 positioning and is not scheduled by nonprofit subscription tier.

---

## Autonomy tiers (platform red lines)

Org-configurable settings must **never** be looser than these platform rules.

| Tier | Meaning | Examples |
|------|---------|----------|
| **A — Autonomous** | Allowed without approval for **internal** artifacts | Internal summaries, drafts, alerts, dashboard updates, handoff records, prep packets |
| **B — Ask first** | Requires explicit human confirmation | External send, changing official filing state, external workflows, finalizing submissions |
| **C — Never** (autonomous) | Never performed by an agent alone | Submit government forms, submit grants, move money, mutate authoritative financial records, destructive external actions |

All current agent implementations operate at **Tier A** only: they persist alerts and runs; they do **not** send email, file forms, or submit grants.

---

## Commercial tier mapping (product ↔ `SubscriptionTier`)

Subscription tiers are defined in Prisma (`SubscriptionTier`). Feature flags live in `@magnus/subscription` (`FeatureKey`).

| Roadmap offering | Subscription tier | Feature keys (indicative) |
|------------------|--------------------|---------------------------|
| Core Magnus Accord | `STARTER` | `donor_crm`, `campaigns`, `compliance_calendar`; **no** autonomous agents |
| Assisted Ops / Growth | `GROWTH` | Adds `stripe_connect_campaigns`, `fund_accounting_lite`, `compliance_reminders`, `ai_concierge`, `board_packets`, `grant_generator`, and `autonomous_ops_assisted` |
| Autonomous Ops / Enterprise | `ENTERPRISE` | Adds `autonomous_ops_standard`, `agents_layer`, advanced AI/board/grant workflows; `mcp_tools` and `worker_financial_layer` remain internal/not public |
| Autonomous Ops Plus / institutional | `ENTERPRISE` | `autonomous_ops_institutional` — reserved for stronger memory, reflection, portfolio intelligence (stages 2–4) |

Eligibility for **which** agent runs on a schedule is implemented in `packages/subscription/src/autonomousOpsPolicy.ts` (tier + `ACTIVE` status).

---

## Technical spine (in repo)

- **Scheduler:** `apps/agents` — cron + per-org (or per-scope) runs.
- **Audit:** `AgentRun` + `Alert`; extended fields on `AgentRun` for autonomy tier, review flags, and `sourceRefs` JSON.
- **Stage 2 data:** `AgentHandoff`, `OrgContextFile`, `AgentOperationalMemoryEntry` — see [AUTONOMOUS_OPS_HANDOFF_AND_MEMORY.md](./AUTONOMOUS_OPS_HANDOFF_AND_MEMORY.md).
- **Volunteer ops:** `VolunteerEvent` time ledger + executive/API surfaces; roster, in-kind valuation, and scheduling remain out of scope — see [AUTONOMOUS_OPS_VOLUNTEER_STATUS.md](./AUTONOMOUS_OPS_VOLUNTEER_STATUS.md).

---

## Explicit non-goals (near term)

- Semantic retrieval / embeddings (Tier 3 memory) before Tier 1 operational log + handoff UX.
- Autonomous external email or grant submission.
- Treating Slack or other webhooks as “internal” without org policy — classify operational alerting vs external comms per deployment.
