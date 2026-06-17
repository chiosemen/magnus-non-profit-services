# Magnus Accord — client copy ↔ source-of-truth map

Use this table to defend or revise marketing copy without drifting from implementation.

| Claim (sales sheet / landing) | Primary source of truth in-repo |
| --- | --- |
| Two-package structure (Assisted Ops + HQ Expansion) | [MAGNUS_ACCORD_PACKAGES.md](./MAGNUS_ACCORD_PACKAGES.md), [MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md](./MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md) |
| Agent names and roles | [MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md](./MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md) §2, [MAGNUS_ACCORD_MATURITY_MAP.md](./MAGNUS_ACCORD_MATURITY_MAP.md) |
| Subscription gating (STARTER has no scheduled agents; GROWTH vs ENTERPRISE) | `packages/subscription/src/autonomousOpsPolicy.ts`, [MAGNUS_ACCORD_MATURITY_MAP.md](./MAGNUS_ACCORD_MATURITY_MAP.md) |
| Worker agent not HQ promise | [MAGNUS_ACCORD_MATURITY_MAP.md](./MAGNUS_ACCORD_MATURITY_MAP.md), [MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md](./MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md) |
| SOLARIS / reflection not implemented | [MAGNUS_ACCORD_FEATURE_DIRECTORY.md](./MAGNUS_ACCORD_FEATURE_DIRECTORY.md), [MAGNUS_ACCORD_MATURITY_MAP.md](./MAGNUS_ACCORD_MATURITY_MAP.md) |
| Tier A internal-only autonomy; no external send/submit/money movement | [MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md](./MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md) §4, [MAGNUS_ACCORD_PRODUCT_POSITIONING.md](./MAGNUS_ACCORD_PRODUCT_POSITIONING.md) |
| No approval inbox / no Tier B external approval product in web pilot | [MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md](./MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md) §4, [MAGNUS_ACCORD_FEATURE_DIRECTORY.md](./MAGNUS_ACCORD_FEATURE_DIRECTORY.md) |
| Human review = flags + audit evidence semantics | [MAGNUS_ACCORD_APPROVAL_TRACEABILITY.md](./MAGNUS_ACCORD_APPROVAL_TRACEABILITY.md) |
| Executive + obligations + control tower scope | [MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md](./MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md) §3, [MAGNUS_ACCORD_FEATURE_DIRECTORY.md](./MAGNUS_ACCORD_FEATURE_DIRECTORY.md) |
| Connector panel keys + Claude status | [MAGNUS_ACCORD_CONNECTOR_REGISTRY.md](./MAGNUS_ACCORD_CONNECTOR_REGISTRY.md), [MAGNUS_ACCORD_FEATURE_DIRECTORY.md](./MAGNUS_ACCORD_FEATURE_DIRECTORY.md) |
| MCP internal/operator-only caveat | [MAGNUS_ACCORD_CONNECTOR_REGISTRY.md](./MAGNUS_ACCORD_CONNECTOR_REGISTRY.md), [MAGNUS_ACCORD_MATURITY_MAP.md](./MAGNUS_ACCORD_MATURITY_MAP.md) |
| Donor/volunteer APIs without web UI; ledger-first | [MAGNUS_ACCORD_FEATURE_DIRECTORY.md](./MAGNUS_ACCORD_FEATURE_DIRECTORY.md), [MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md](./MAGNUS_ACCORD_PILOT_LAUNCH_PACKAGE.md) §7 |
| Volunteer time-ledger limits | [AUTONOMOUS_OPS_VOLUNTEER_STATUS.md](../AUTONOMOUS_OPS_VOLUNTEER_STATUS.md) |
| Semantic memory keyword limitation | [MAGNUS_ACCORD_MATURITY_MAP.md](./MAGNUS_ACCORD_MATURITY_MAP.md), [AUTONOMOUS_OPS_HANDOFF_AND_MEMORY.md](../AUTONOMOUS_OPS_HANDOFF_AND_MEMORY.md) |
| Action matrix target vs runtime enforcement | [MAGNUS_ACCORD_ACTION_MATRIX.md](./MAGNUS_ACCORD_ACTION_MATRIX.md) |
| Client feature matrix by package | [MAGNUS_ACCORD_CLIENT_FEATURE_MATRIX.md](./MAGNUS_ACCORD_CLIENT_FEATURE_MATRIX.md) |
