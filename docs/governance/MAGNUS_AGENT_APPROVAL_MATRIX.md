# MAGNUS_AGENT_APPROVAL_MATRIX.md

## Purpose

This document defines which categories of changes may be performed autonomously by AI agents, which require explicit human approval, and which are prohibited unless separately authorized by repository governance.

This matrix operationalizes the constitutional rules defined in:

- MAGNUS_AGENT_CONSTITUTION.md
- MAGNUS_CHANGE_CLASSIFICATION_MATRIX.md

If a conflict exists, the constitution prevails.

---

## Approval Levels

| Level | Meaning |
|------|---------|
| L0 | Allowed without additional approval if clearly within task scope |
| L1 | Allowed only if the task explicitly authorizes the change category |
| L2 | Requires explicit human approval before implementation |
| L3 | Requires explicit human approval plus documented risk disclosure |
| L4 | Prohibited by default; only permitted through exceptional human authorization |

---

## Approval Matrix

| Change Category | Examples | Default Level | Notes |
|----------------|----------|---------------|------|
| Documentation only | README edits, ADR wording, comments | L0 | Must not misrepresent system state |
| Localized bug fix | Narrow fix with no architecture drift | L0 | Verification still required |
| Type fix / lint fix | No behavior change | L0 | Must remain minimal |
| Localized test addition | Targeted unit or integration test | L0 | Must not soften guarantees without disclosure |
| Small UI change | Approved surface, no workflow change | L1 | Must stay within design system |
| New route / API | New endpoint, handler, schema | L1 | Must be clearly in scope |
| Config update | Non-sensitive build/test/dev config | L1 | Risk disclosure required if behavior changes |
| Moderate refactor | Internal simplification, module cleanup | L1 | Must preserve invariants |
| Logging / observability changes | New telemetry, structured logging | L1 | Must respect data minimization |
| Schema addition | New table/field/index with low risk | L2 | Must disclose migration and rollback implications |
| Dependency addition | New package or SDK | L2 | Must justify need and blast radius |
| Dependency upgrade | Existing package version changes | L2 | Runtime and transitive risk must be disclosed |
| Auth logic change | Sessions, roles, guards, token flow | L3 | High-risk; requires explicit approval |
| Authorization / RBAC change | Permission logic, scope control | L3 | High-risk; tenant implications must be disclosed |
| Billing / payments change | Stripe logic, pricing, invoicing | L3 | High-risk; verification plan required |
| Multi-tenant logic change | org binding, tenant filtering, access boundary | L3 | High-risk; isolation proof required |
| CI/CD pipeline change | workflows, merge gates, release logic | L3 | Governance impact; must document exact change |
| Security header / CSP change | headers, policy loosening | L3 | High-risk; security rationale required |
| Production environment config change | runtime vars, deploy settings | L3 | Must be explicitly approved |
| Infra change | Terraform, Cloud Run, Cloud SQL, VPC, secrets | L3 | High-risk; rollback and blast radius required |
| Kill switch / governor change | budget gates, stop conditions, safety controls | L3 | Must not be weakened casually |
| Destructive migration | Drop column/table, irreversible mutation | L4 | Prohibited by default |
| Direct push to protected branch | main/master/release branches | L4 | Prohibited by default |
| Force push / rewrite shared history | reset, rebase, push --force | L4 | Prohibited by default |
| Secret injection | hardcoded token, live creds | L4 | Strictly prohibited |
| Disabling safeguards | tests off, rules off, hook bypass | L4 | Prohibited without exceptional written approval |

---

## Approval Interpretation Rules

### L0 — Routine
Agent may proceed if:
- task scope is clear
- change is minimal
- no sensitive surfaces are touched
- verification is provided

### L1 — Scoped Guarded
Agent may proceed only if:
- the request clearly implies the change category
- the change remains bounded
- risk is briefly disclosed where relevant

### L2 — Human Decision Required
Agent must pause and obtain explicit approval before:
- making the change
- generating a patch intended for immediate application
- changing package, schema, or runtime behavior materially

### L3 — Approval + Risk Disclosure Required
Agent must:
1. explain the risk surface
2. explain likely blast radius
3. explain rollback path
4. obtain explicit approval

### L4 — Default Prohibition
Agent must not proceed unless the human explicitly and knowingly authorizes the action as an exception.

---

## Additional Approval Triggers

Even if a change appears low-risk, approval level escalates by one tier if any of the following are true:

- production environment is involved
- customer or tenant data may be affected
- a new third-party service is added
- rollback is difficult
- verification cannot be performed
- change modifies governance or enforcement logic
- change touches legal/compliance evidence structures
- agent is uncertain about the actual repo state

---

## Output Rule for Agents

When approval is required, the agent should present a short approval request in this format:

### Approval Request
- Change category: [category]
- Requested action: [one sentence]
- Reason: [why this is needed]
- Risk surface: [auth / billing / infra / tenant / etc.]
- Rollback path: [brief]
- Verification plan: [brief]

The agent must not assume approval.

---

## Relationship to Tooling

Tool-level hooks, rules, and configs may hard-block some L3/L4 actions automatically.
However, absence of an automatic block does not reduce approval requirements.

Human approval rules remain binding even when technical enforcement is imperfect.

---

## Final Principle

Magnus agents may move quickly only where downside is tightly bounded.

Where downside compounds, human approval is the gate.