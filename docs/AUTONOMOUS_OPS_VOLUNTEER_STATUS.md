# Volunteer operations — deployment truth

This document records **what Magnus Accord implements today** for volunteer operations so operators and agents do not assume coverage that does not exist.

## Current state (this repo)

- **Volunteer time ledger:** Prisma model `VolunteerEvent` — append-only rows per org (`occurredAt`, `hours`, optional `activityLabel`, `sourceSystem`, `sourceRef`, optional `raw`). Idempotent on `(orgId, sourceSystem, sourceRef)`.
- **Org-scoped APIs:** `GET/POST /api/org/volunteer-events` on org-dashboard-api (JWT org scope), mirroring donor-events patterns.
- **Executive rollup:** `volunteer_ops` module state and evidence are derived **only** from `VolunteerEvent` aggregates and recent rows (see `deriveVolunteerOpsModuleState` in `@magnus/org-autonomous-ops-context`).

Grant-generator copy, Form 990 narrative fields, or MCP demo payloads that mention “volunteers” are **not** automatically wired to this ledger.

## What the ledger does not represent

- **Roster / deduplicated individuals** — no `VolunteerPerson` model; `activityLabel` is optional source-provided text, not identity resolution.
- **In-kind donation valuation** — not stored here; time hours only.
- **Scheduling or attendance truth** — entries are as reported by `sourceSystem` / ingestion, not shift calendars.

## Prerequisites for deeper truth (future slices)

1. Optional identity or pseudonym table with stable keys, linked from events.
2. In-kind line items with explicit **valuation source** in a separate model.
3. Executive and APIs wired only to those stores when added.

## Explicitly out of scope (near term)

- Shift scheduling and calendar integration as authoritative attendance.
- Volunteer email/SMS or arbitrary messaging platforms.
- CRM / external volunteer platform sync unless modeled as explicit ingestion with `sourceRef` discipline.

See also [AUTONOMOUS_OPS_ROADMAP.md](./AUTONOMOUS_OPS_ROADMAP.md).
