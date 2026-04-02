# Magnus Accord — org context files (ORG_*)

Five canonical markdown files in `OrgContextFile` define **operator intent and org facts** for autonomous agents. They are **not** a CMS: staff edit markdown directly (API or dashboard). Rows may be **auto-seeded** with templates; seeded content is **not** pilot-ready until validated.

## Files

| Kind | Purpose | Pilot |
| --- | --- | --- |
| `ORG_IDENTITY` | Legal/org snapshot, mission, **NTEE**, **state footprint**, board basics. Feeds **GrantIntelligenceHerald** (Candid matching) and executive readiness. | **Required** (structured fields for HERALD) |
| `ORG_SOUL` | Voice, tone, red lines for drafts. | Recommended |
| `ORG_AGENTS` | Which agents/workflows, escalation map. | Recommended |
| `ORG_MEMORY` | Curated durable lessons (not raw logs). | Recommended |
| `ORG_HEARTBEAT` | Cadence / escalation triggers for checks. | Recommended |

## Template marker

Seeded files include an HTML comment:

`<!-- magnus:template kind=ORG_IDENTITY version=1 -->`

- While this marker is present, **ORG_IDENTITY** is treated as **template** if the grant profile cannot be built (see below).
- For other files, the marker implies you need **substantive prose** (or remove the marker after editing) before status becomes **READY**.

## Grant profile (HERALD) — required inputs

`GrantIntelligenceHerald` uses `parseOrgIdentityForGrantProfile` (shared in `@magnus/org-autonomous-ops-context`):

- **Sector / NTEE** section must contain an NTEE code like `B20`.
- **State footprint** must contain a US state code (e.g. `CA`).
- **`Organization.annualRevenue`** must be set to a positive number (budget signal for matching).

Section headers must match exactly: `## Mission`, `## Sector / NTEE`, `## State footprint`.

## Validation & UI

- **Web:** `/app/autonomous-ops/directory` — shows per-file status, blockers, and suggested actions (`GET /api/autonomous-ops/directory` includes `report`).
- **Web (report only):** `GET /api/autonomous-ops/identity-report` — JSON `{ orgId, report }` for scripts.
- **org-dashboard-api:** `GET /api/org/autonomous-ops/identity-files/report` — same report for service clients.

## Agent behavior (fail-safe)

- **HERALD:** If the grant profile is incomplete, emits `HERALD_MISSING_MATCH_INPUTS` (LOW) — no external API calls.
- **BoardIntelligenceOracle:** If any file is not **READY**, prepends `ORACLE_ORG_CONTEXT_INCOMPLETE` (LOW); weekly/pre-board briefings still emit with explicit limitations.

## Related

- [MAGNUS_ACCORD_PILOT_ONBOARDING_CHECKLIST.md](./MAGNUS_ACCORD_PILOT_ONBOARDING_CHECKLIST.md)
