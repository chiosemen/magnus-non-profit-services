# Magnus Accord — approval and review traceability (pilot)

This document describes **what is actually recorded today** when human review gates and internal autonomy checks apply. It avoids calling workflow steps “approval” when they are only **status transitions** or **internal side-effect gates**.

## Terms (precise)

| Term | Meaning in this codebase |
|------|---------------------------|
| **Human review flag** | `AgentHandoff.requiresHumanReview` and/or `AgentRun.requiresHumanReview` — signals that staff should triage; not a legal/compliance attestation. |
| **Ask-first (Tier B)** | `assertInternalSideEffectAllowed` requires `requiresHumanReview: true` on the run context before persisting **handoff** or **memory** side effects. |
| **Blocked (Tier C / mismatch)** | Internal effect throws `AUTONOMY_BLOCKED:…`; nothing is persisted for that effect; the run may end `FAILED` with `error` and structured `metrics.autonomyTrace`. |
| **Handoff RESOLVED** | Workflow closure with required `resolutionSummary` (or evidence) in audit `detail` — **not** “approved to act externally.” |
| **Alert RESOLVED** | Operational closure on an internal signal — separate from handoff review semantics. |

## What is recorded when review is required

1. **Agent run (start)** — `AgentRun` stores `autonomyTier`, `requiresHumanReview` (from org boundary + stamp), `startedAt`, and optional `sourceRefs`.
2. **Handoff created** — `AgentHandoff.requiresHumanReview` is stored on the row. The append-only **CREATED** audit entry’s `detail` includes a snapshot: `requiresHumanReview`, `relatedAgentRunId`, `urgency`, `fromAgentName`, `toAgentName`, and `sourceEvidence`, so the audit trail is readable without joining back to the handoff row.
3. **No separate “approval pending” record** — the open handoff + flag is the queue.

## What is recorded when staff or agents advance a handoff

Every transition appends **STATUS_CHANGED** with `actorType`, `actorName`, `fromStatus`, `toStatus`, `createdAt`, and `detail` that **always** includes:

- `handoffRequiresHumanReview` — value from the handoff **at transition time** (before status update).
- `relatedAgentRunId` — same snapshot.

Callers must still supply, for terminal states:

- **RESOLVED:** `resolutionSummary` (≥3 chars) and/or `resolutionEvidence` array (see `AgentHandoffService.assertTerminalEvidence`).
- **CANCELLED:** `cancellationReason` (≥3 chars).

This is **auditable workflow evidence**, not a claim that an external action was authorized.

## What is recorded when an internal effect is blocked

1. **No handoff / memory row** for that failed write.
2. **Agent run** — `status: FAILED`, `finishedAt`, `error` (redacted string; `AUTONOMY_BLOCKED:…` messages are short and preserved).
3. **metrics.autonomyTrace** (when the error matches `AUTONOMY_BLOCKED:*`): `{ decision: 'BLOCKED_INTERNAL_EFFECT', effect, reasonCode }` for client-readable parsing alongside `error`.

## Linkage: run ↔ handoff ↔ “external action”

| Link | Mechanism |
|------|-----------|
| Run → handoff | `AgentHandoff.relatedAgentRunId` and CREATED audit `detail.relatedAgentRunId`. |
| Handoff → run | Same field; audit snapshots duplicate it on each transition. |
| External action | **There is no autonomous external submit/send.** Connector target policy is documented separately (`MAGNUS_ACCORD_ACTION_MATRIX.md`); runtime enforcement for internal effects is `assertInternalSideEffectAllowed` only for `handoff` and `memory`. |

## Timestamps and actors

| Artifact | Timestamp | Actor |
|----------|-----------|--------|
| Handoff audit | `AgentHandoffAuditEntry.createdAt` | `actorType` + optional `actorName` on each entry |
| Handoff resolution | `AgentHandoff.resolvedAt` on terminal | Same as last terminal audit row’s `createdAt` in practice |
| Agent run | `startedAt` / `finishedAt` | No per-run human actor on the row today |

## Intentionally out of scope (pilot)

- **`AgentRun.humanReviewedAt` / `humanReviewedBy`** — columns exist but are **not** written by the agents service or org-dashboard-api in this pilot; no fabricated “staff signed off on run” semantics.
- **Per-connector action-class enforcement** — not logged per action on every path; see action matrix doc for target vs runtime gap.
- **Alert audit enrichment** — same append-only pattern as handoffs could be extended later; not changed in this slice.
- **UI for audit timelines** — APIs (`GET …/handoffs/:id/audit`) exist; dedicated operator UI may follow.

## Related docs

- `docs/AUTONOMOUS_OPS_HANDOFF_AND_MEMORY.md` — primitives and routes.
- `docs/product/MAGNUS_ACCORD_ACTION_MATRIX.md` — target policy bands.
- `apps/agents/src/autonomy/enforcement.ts` — `assertInternalSideEffectAllowed`.
