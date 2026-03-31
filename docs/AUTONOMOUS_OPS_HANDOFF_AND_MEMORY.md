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

### Service and API (`AgentHandoffService`)

- **Lifecycle:** `OPEN` → `ACKNOWLEDGED` → `RESOLVED`, or `OPEN` / `ACKNOWLEDGED` → `CANCELLED`. Terminal states: `RESOLVED`, `CANCELLED`. Invalid transitions return `409 INVALID_TRANSITION`.
- **Audit:** append-only `AgentHandoffAuditEntry` rows (`CREATED`, `STATUS_CHANGED`) with `actorType` `agent` | `user` | `system`.
- **Limits:** title ≤ 500 chars; body ≤ 128 KiB UTF-8; `sourceEvidence` must be a JSON **array** if present.
- **org-dashboard-api (JWT org scope):**
  - `POST /api/org/autonomous-ops/handoffs` — create (`fromAgentName`, `toAgentName`, `title`, `body`, optional `urgency`, `requiresHumanReview`, `sourceEvidence`, `relatedAgentRunId` scoped to org `AgentRun`).
  - `GET /api/org/autonomous-ops/handoffs` — list; query `status`, `toAgentName`.
  - `GET /api/org/autonomous-ops/handoffs/:id` — one item.
  - `PATCH /api/org/autonomous-ops/handoffs/:id/status` — `{ "toStatus", "actorType", "actorName"?, "detail"? }`.
  - `GET /api/org/autonomous-ops/handoffs/:id/audit` — audit trail.

## Three-tier memory (Autonomous Ops)

All read APIs include an explicit **disclaimer** string so consumers never treat memory as silent, unquestionable truth.

### Tier 1 — Daily operational (`AgentOperationalMemoryEntry`)

- Append-only log: **orgId**, **agentName**, **kind**, **payload** (JSON), optional **sourceRefs** (JSON object or array), optional **agentRunId** (must be org-scoped `AgentRun`).
- **confidence** — optional 0–1; omit when unknown.
- **recallDisabled** + **recallDisabledReason** — exclude row from default recall (`listOperational` filters these out unless `includeRecallDisabled=true`).

### Tier 2 — Curated (`OrgCuratedMemoryItem`)

- Structured items: **title**, **body**, **confidence** (required, default 0.5), **sourceRefs**, **isActive**.
- **Curation rules:** `isActive=false` removes the item from default lists (soft retire); content is not deleted. New items default to `isActive=true`. Curated text is still **not** authoritative—verify against primary records.
- **ORG_MEMORY** in `OrgContextFile` remains valid for narrative/org-edited prose; `OrgCuratedMemoryItem` is for discrete, list-shaped facts.

### Tier 3 — Semantic (`OrgSemanticMemoryChunk`)

- **chunkText**, **confidence**, **sourceRefs**, **embeddingReady** (default `false`).
- **Fallback behavior:** search uses **PostgreSQL case-insensitive substring** match only (`matchMode: keyword_insensitive_contains`). Responses set **semanticReady: false** until a real embedding pipeline sets `embeddingReady` and (future) vector search. Empty query returns no hits with the same disclaimer.

### org-dashboard-api routes (`OrgMemoryService`)

- `POST /api/org/autonomous-ops/memory/operational` — append Tier 1.
- `GET /api/org/autonomous-ops/memory/operational` — list (`includeRecallDisabled`, `take`).
- `PATCH /api/org/autonomous-ops/memory/operational/:id/recall` — `{ disabled, reason? }`.
- `POST /api/org/autonomous-ops/memory/curated` — create Tier 2.
- `GET /api/org/autonomous-ops/memory/curated` — list (`includeInactive`, `take`).
- `PATCH /api/org/autonomous-ops/memory/curated/:id/deactivate` — soft deactivate.
- `POST /api/org/autonomous-ops/memory/semantic/chunks` — ingest Tier 3 chunk.
- `GET /api/org/autonomous-ops/memory/semantic/search?q=&limit=` — keyword search + disclaimer.

## Audit linkage

Every autonomous output should be traceable through:

1. `AgentRun` (timing, autonomy tier, `sourceRefs`, metrics).
2. `Alert` rows emitted in the same run (via metrics and dedupe keys today; handoff links in future).
3. `AgentHandoff` / `AgentOperationalMemoryEntry` when used.
