# Autonomous Ops — handoff, identity files, and memory

This document describes **Stage 2** primitives implemented in the database. APIs and UI can consume these models in follow-on work.

## Org context files (`OrgContextFile`)

Five curated markdown documents per organization (content in `content`, typed by `kind`):

| `OrgContextFileKind` | Purpose |
|----------------------|---------|
| `ORG_IDENTITY` | Name, EIN, mission, fiscal year, sector, footprint, board basics, contacts, active modules |
| `ORG_SOUL` | Mission language, tone, values, sensitivities, red lines, risk posture |
| `ORG_AGENTS` | Active agents, workflows, integrations, autonomy by workflow, escalation map |
| `ORG_MEMORY` | Durable learnings, verified patterns, recurring problems, funder lessons |
| `ORG_HEARTBEAT` | Daily/weekly/monthly/quarterly tasks, idle behavior, escalation triggers |

**Uniqueness:** at most one row per `(orgId, kind)` via unique constraint. Upserts replace prior content.

### Persistence and API (`@magnus/org-autonomous-ops-context`)

- **Service:** `OrgIdentityFilesService` — `ensureDefaults(orgId)` creates missing rows only (idempotent); `list`, `get`, `upsertContent`; max content **512 KiB** (`CONTENT_TOO_LARGE`).
- **Templates:** `defaultMarkdownForKind` — `ORG_IDENTITY` seeds a table from `prisma.Organization` with an HTML `source-linked` comment; other kinds use structured scaffolds.
- **org-dashboard-api (JWT org scope):**
  - `GET /api/org/autonomous-ops/identity-files` — all five files (bootstraps defaults on first read).
  - `GET /api/org/autonomous-ops/identity-files/:kind` — one kind (`ORG_IDENTITY`, …).
  - `PUT /api/org/autonomous-ops/identity-files/:kind` — body `{ "content": "..." }`.

## Agent handoff (`AgentHandoff`)

Asynchronous work queue between agents (and staff):

- **fromAgentName** / **toAgentName** — string names matching `AgentRun.agentName` (or `staff` for human-facing items).
- **status** — `OPEN` → `ACKNOWLEDGED` → `RESOLVED` or `CANCELLED`.
- **requiresHumanReview** — when true, staff should triage before downstream automation.
- **sourceEvidence** — JSON array of `{ "type", "id"?, "label"? }` (or similar) for auditability.
- **relatedAgentRunId** — optional link to the `AgentRun` that created the handoff.

Consumers should treat handoff bodies as **draft internal context**, not external truth.

## Tier 1 operational memory (`AgentOperationalMemoryEntry`)

Append-only (by convention) log of agent outputs and notable events:

- **orgId**, **agentName**, **kind** (short string, e.g. `digest`, `alert_batch`, `escalation`).
- **payload** — JSON document (structured summary).
- **agentRunId** — optional FK to `AgentRun`.
- **sourceRefs** — JSON for pointers back to domain rows or tool outputs.

**Tier 2 (curated)** can continue to live in `OrgContextFile` / `ORG_MEMORY` until a dedicated curation workflow exists. **Tier 3 (semantic retrieval)** is not implemented in this migration.

## Audit linkage

Every autonomous output should be traceable through:

1. `AgentRun` (timing, autonomy tier, `sourceRefs`, metrics).
2. `Alert` rows emitted in the same run (via metrics and dedupe keys today; handoff links in future).
3. `AgentHandoff` / `AgentOperationalMemoryEntry` when used.
