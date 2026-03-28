# MAGNUS_VERIFICATION_TRANSCRIPT_TEMPLATE.md

## Purpose

This document defines the standard format for recording verification evidence after meaningful AI-assisted work in Magnus repositories.

The goal is to preserve an audit-grade transcript of:

- what changed
- what was verified
- what remains unverified
- what risks remain

This template should be used for:

- major patches
- security-sensitive changes
- phase gate work
- CI recovery
- infrastructure modifications
- agent governance changes
- any work requiring durable evidence

---

## Transcript Header

- Date: [YYYY-MM-DD]
- Repo: [repository name]
- Branch / Worktree: [branch name]
- Operator: [human]
- Agent / Tool: [Claude / Codex / Copilot / other]
- Task / Phase: [short description]
- Related Spec / ADR / Issue: [links or file paths]

---

## 1. Change Summary

Provide a concise factual summary of what changed.

Example fields:

- files touched
- modules affected
- contracts changed
- tests added or modified
- configs updated
- docs updated

### Example
- Added guarded validation to `auth.middleware.ts`
- Updated `docs/PHASE_GATES_POLICY.md`
- Added targeted tests for tenant isolation branch
- No dependency changes
- No infra changes

---

## 2. Change Classification

- Primary class: [Class A / B / C]
- Approval level required: [L0 / L1 / L2 / L3 / L4]
- Was explicit approval obtained?: [Yes / No / N/A]
- Sensitive surfaces touched: [auth / infra / billing / tenant / compliance / none]

---

## 3. Verification Performed

List each verification step actually performed.

| Check Type | Command / Method | Result | Notes |
|-----------|------------------|--------|------|
| Typecheck | `pnpm -r typecheck` | Pass / Fail / Not Run | |
| Lint | `pnpm -r lint` | Pass / Fail / Not Run | |
| Unit tests | `pnpm test --filter ...` | Pass / Fail / Not Run | |
| Integration tests | [command] | Pass / Fail / Not Run | |
| Build | [command] | Pass / Fail / Not Run | |
| Policy/rules validation | [command] | Pass / Fail / Not Run | |
| Hook validation | [dry run / runtime] | Pass / Fail / Partial | |
| Manual review | [describe] | Completed / Not Completed | |

---

## 4. Verification Output Summary

Summarize the actual outcomes.

### Example
- Typecheck passed across affected packages
- Targeted unit tests passed
- Full integration suite not run
- Hook script syntax checked, but live runtime trigger remains unverified
- Build not run because change was docs-only

Be precise.
Do not overstate completeness.

---

## 5. Unverified Areas

List anything not verified.

Examples:
- runtime behavior in production-like environment
- end-to-end hook firing
- migration execution
- rollback path under failure
- external API behavior
- mobile/browser-specific behavior

### Required format
- Area not verified: [area]
- Reason: [why not]
- Potential implication: [brief]

---

## 6. Residual Risk Register

| Risk | Severity | Why it remains | Proposed follow-up |
|------|----------|----------------|--------------------|
| Example: hook runtime not fully tested | Medium | only syntax/dry-run checked | validate in live session |
| Example: dependency impact not fully mapped | High | transitive tree not reviewed | run lockfile + audit review |

---

## 7. Drift Check

State whether any unintended widening of scope occurred.

- Scope drift detected?: [Yes / No]
- If yes, describe: [details]
- If no, confirm: Change remained bounded to requested objective.

---

## 8. Rollback Notes

If rollback is relevant, document the rollback path.

Examples:
- revert commit
- restore previous config
- disable feature flag
- re-run prior migration state

If not relevant, state why.

---

## 9. Final Operator Summary

Provide a short closing assessment.

### Format
- Completion status: [Complete / Partial / Draft only]
- Confidence level: [High / Medium / Low]
- Recommended next step: [one sentence]
- Safe to merge?: [Yes / No / With conditions]

---

## 10. Signature Block

- Prepared by: [agent + operator]
- Reviewed by: [human if applicable]
- Timestamp: [ISO timestamp]

---

## Rules for Use

1. Never claim a check passed if it was not run.
2. Never hide unverified areas.
3. Distinguish syntax validation from runtime validation.
4. Distinguish targeted tests from full-suite tests.
5. Keep transcript factual, not promotional.

---

## Minimal Example

### Completion status
Partial

### Confidence
Medium

### Verified
- Typecheck passed
- Targeted tests passed
- Rules parsed successfully

### Not verified
- live hook runtime
- production deployment behavior

### Safe to merge?
With conditions: live hook test still needed