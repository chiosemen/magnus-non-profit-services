# MAGNUS_AGENT_RISK_DISCLOSURE_TEMPLATE.md

## Purpose

This template standardizes how Magnus agents disclose risk before performing guarded or high-risk actions.

It applies especially to:

- Class A changes
- L2 / L3 / L4 approval scenarios
- infrastructure changes
- auth / billing / tenant logic
- schema / dependency / governance modifications

The purpose is to ensure the human operator receives a clean, decision-grade summary before approving risky work.

---

## Risk Disclosure Template

### Proposed Change
[One-sentence description of the intended action.]

### Why This Change Is Being Proposed
[Why the change is needed now.]

### Change Classification
- Class: [A / B / C]
- Approval level: [L0 / L1 / L2 / L3 / L4]

### Sensitive Surfaces Touched
Mark all that apply:

- [ ] Authentication
- [ ] Authorization
- [ ] Tenant isolation
- [ ] Billing / payments
- [ ] Infrastructure
- [ ] CI/CD
- [ ] Security policy
- [ ] Database schema
- [ ] Compliance evidence
- [ ] Observability / logging
- [ ] Third-party integrations

### Primary Risks
List the real downside, not generic filler.

Example format:
- Could weaken tenant isolation if filter logic is incomplete
- Could break login flow if session parsing changes
- Could introduce transitive package instability
- Could reduce CI gate strictness unintentionally

### Blast Radius
Describe what could be affected if this goes wrong.

Examples:
- single module only
- all API auth paths
- deployment pipeline
- all tenant-scoped queries
- billing workflows
- compliance scoring history

### Reversibility
- Rollback difficulty: [Low / Medium / High]
- Rollback method: [brief]
- Irreversible elements?: [Yes / No]

### Verification Plan
List the checks that will be used to validate the change.

Examples:
- typecheck
- targeted unit tests
- integration tests
- policy/rules dry run
- migration dry run
- manual review of affected routes
- CI proof

### Uncertainty / Known Unknowns
State what is still uncertain.

Examples:
- live third-party behavior not verified
- runtime hook semantics inferred from docs but not tested
- migration performance at production scale unknown

### Recommendation
Choose one:
- Proceed
- Proceed only after explicit approval
- Do not proceed without additional specification
- Do not proceed; safer alternative recommended

### Approval Request
- Do you approve this change? [Yes / No required from human]

---

## Short-Form Version

Use this when the change is sensitive but narrow.

### Risk Disclosure
- Change: [one line]
- Risk surface: [auth / infra / tenant / etc.]
- Main risk: [one line]
- Rollback: [one line]
- Verification: [one line]
- Approval needed: [Yes / No]

---

## Agent Rules

1. Risk disclosures must be concrete.
2. Do not hide the real downside.
3. Do not substitute confidence for evidence.
4. If rollback is hard, say so plainly.
5. If the change is prohibited by default, say so explicitly.

---

## Example

### Proposed Change
Upgrade the auth middleware to centralize test-auth gating.

### Why This Change Is Being Proposed
Current logic is fragmented and may allow unsafe non-development behavior.

### Change Classification
- Class: A
- Approval level: L3

### Sensitive Surfaces Touched
- [x] Authentication
- [x] Security policy

### Primary Risks
- Could accidentally block valid development auth flows
- Could accidentally loosen production auth protections if environment checks are wrong

### Blast Radius
All protected API routes using shared auth middleware.

### Reversibility
- Rollback difficulty: Low
- Rollback method: revert the patch and restore previous middleware logic
- Irreversible elements?: No

### Verification Plan
- typecheck
- targeted auth middleware tests
- startup guard test
- manual review of env gating

### Uncertainty / Known Unknowns
Did not validate against live deployment environment.

### Recommendation
Proceed only after explicit approval

### Approval Request
Do you approve this auth-related change?