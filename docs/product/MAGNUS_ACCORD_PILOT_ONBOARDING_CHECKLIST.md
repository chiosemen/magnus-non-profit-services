# Magnus Accord — pilot onboarding checklist

This checklist complements the **read-only** pilot readiness read model (`buildPilotReadiness` in `@magnus/org-autonomous-ops-context`, exposed at `GET /api/autonomous-ops/readiness` and `/app/autonomous-ops/readiness`). Use it for human-run steps; the API reflects database truth and does not automate setup.

## Before go-live

1. **Subscription** — Org has `ACTIVE` subscription for pilot tier (Accord surfaces assume an active tenant).
2. **Org identity context** — All five canonical files exist with non-trivial content: `ORG_IDENTITY`, `ORG_SOUL`, `ORG_AGENTS`, `ORG_MEMORY`, `ORG_HEARTBEAT`. See [MAGNUS_ACCORD_ORG_CONTEXT_FILES.md](./MAGNUS_ACCORD_ORG_CONTEXT_FILES.md) for required vs optional fields, template markers, and validation.
3. **Autonomous Ops settings** — Persisted `OrgAutonomousOpsSettings` row with at least one **subscription-eligible** launch agent enabled (see `subscriptionAllowsScheduledAgent`).
4. **Claude Partner** — `claudeStatus` progressed to `ACTIVE` for the connector path the pilot uses (configuring or suspended states surface as `PARTIAL`, not `READY`).
5. **Executive board** — With `ACTIVE` subscription and `ORG_IDENTITY` populated, staff can load the executive surface without missing prerequisites.
6. **Obligations** — Understand that the obligation snapshot may be empty if there are no board-prep alerts, open handoffs, or due-soon compliance rows; empty is `PARTIAL`, not fake green.
7. **Donor / volunteer ledgers (pilot scope)** — Connect Stripe and/or ingest events so donor and volunteer modules have signal when those workflows are in scope.
8. **Operational memory** — Until operational memory thresholds are met (`evaluateMemorySufficiency`), reflection-grade features remain `NO_GO`; the readiness page labels this explicitly.

## Example API shape (illustrative)

Statuses are always one of `NOT_CONFIGURED`, `PARTIAL`, or `READY`. Values below are illustrative.

```json
{
  "disclaimer": "Read-only pilot readiness…",
  "orgId": "00000000-0000-0000-0000-000000000000",
  "asOfIso": "2026-04-02T12:00:00.000Z",
  "org": {
    "subscriptionTier": "GROWTH",
    "subscriptionStatus": "ACTIVE",
    "claudeStatus": "ACTIVE"
  },
  "dimensions": [
    {
      "id": "subscription_active",
      "label": "Subscription (Accord pilot)",
      "status": "READY",
      "blockers": [],
      "notes": []
    }
  ],
  "overall": {
    "summary": "PARTIAL",
    "pilotCandidate": true,
    "blockers": ["memory_reflection:memory:operational_entries_below_min"]
  },
  "memoryEvaluation": {
    "readiness": "NO_GO",
    "reasons": ["operational_entries_below_min"]
  }
}
```

## Related docs

- [Pilot runbook](../operations/MAGNUS_ACCORD_PILOT_RUNBOOK.md) · [Prelaunch checklist](../operations/MAGNUS_ACCORD_PRELAUNCH_CHECKLIST.md)
- `docs/product/MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md`
- `docs/product/MAGNUS_ACCORD_CONNECTOR_REGISTRY.md`
