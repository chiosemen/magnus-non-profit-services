# MAGNUS_REPO_SECURITY_BASELINE.md

## Purpose

This document defines the default security baseline expected across Magnus repositories.

It is the minimum defensive posture that all AI agents, human operators, and repo workflows must preserve unless a stricter vertical overlay applies.

This baseline supports the constitutional principles of:

- security first
- fail closed
- auditability
- minimal drift
- human sovereignty

---

## 1. Security Baseline Principles

Magnus repositories must default to:

- deny by default where appropriate
- explicit approval for risky changes
- least privilege
- environment separation
- secrets hygiene
- auditable change paths
- minimal blast radius
- reproducible verification

---

## 2. Secrets and Credentials

### Required
- secrets must live outside the repository
- `.env.example` may contain placeholders only
- secret names may be documented, not values
- secret access should be least-privilege

### Prohibited
- hardcoded API keys
- live tokens in commits
- secrets in logs
- secrets in screenshots or transcripts
- copying production secrets into local examples

### Enforcement Expectations
- pre-write secret scanning where available
- CI secret scanning
- review of changed config files
- immediate remediation if leakage occurs

---

## 3. Environment Separation

Environments must remain clearly separated:

- local
- development
- staging
- production

### Required
- production flags must fail closed
- development bypasses must not activate in production
- environment validation must be explicit
- test auth must never leak into production pathways

### Prohibited
- loose environment checks
- default-true unsafe flags
- fallback behavior that weakens protection in unknown environments

---

## 4. Authentication and Authorization

### Required
- centralized auth enforcement where practical
- explicit role/scope checks
- no hidden bypass paths
- no silent fail-open behavior

### Prohibited
- test auth in production
- overly broad admin overrides
- unclear scope resolution
- auth behavior inferred from fragile client input alone

### Agent Rule
Any change to auth or RBAC is high-risk and must be treated as Class A / L3 by default.

---

## 5. Tenant Isolation

For multi-tenant systems:

### Required
- explicit org/tenant binding
- query-level tenant filtering
- no cross-tenant access by default
- proof-oriented tests for tenant boundaries

### Prohibited
- missing tenant predicates
- trusting client-provided tenant context without verification
- fallback-to-global behavior
- silent overwrite of org-bound records

### Agent Rule
Tenant model changes require explicit approval and isolation verification.

---

## 6. Data Handling and Logging

### Required
- log only what is necessary
- redact sensitive values
- preserve audit events where required
- separate operational logs from sensitive evidence artifacts

### Prohibited
- logging full tokens
- dumping raw sensitive payloads
- logging PII without justification
- leaking financial or compliance-sensitive raw data casually

---

## 7. Dependency Security

### Required
- justify new dependencies
- prefer minimal additions
- review transitive risk for critical packages
- pin or lock dependencies according to repo policy

### Prohibited
- dependency sprawl
- casual upgrades without rationale
- adding libraries for trivial convenience
- remote install patterns that bypass normal review

### Agent Rule
Dependency changes are never free; they require explicit disclosure.

---

## 8. Shell and Command Safety

### Required
- commands must be reviewable
- destructive intent must be explicit
- remote execution patterns must be treated as dangerous

### Prohibited
- `rm -rf` without explicit approval
- `curl ... | sh`
- `wget ... | bash`
- `chmod 777`
- force push on shared branches without approval
- broad recursive mutations without bounded scope

---

## 9. CI/CD and Merge Gates

### Required
- CI must remain a trusted gate
- important checks must not be silently weakened
- branch protections must be respected
- release workflows must remain reviewable

### Prohibited
- disabling tests to make CI green
- loosening merge gates casually
- bypassing branch protections
- undocumented workflow mutations

---

## 10. Infrastructure and Deployment

### Required
- production configuration changes must be explicit
- rollback path should be known
- least privilege service access should be maintained
- infra drift must be documented where material

### Prohibited
- casual changes to deployment targets
- changing secrets handling without approval
- weakening network/security posture silently
- modifying runtime kill switches or governors without disclosure

---

## 11. Compliance and Evidence Systems

For compliance-oriented Magnus systems:

### Required
- preserve provenance
- preserve score/evidence traceability
- distinguish raw evidence from derived judgment
- maintain version awareness where applicable

### Prohibited
- silent mutation of evidence history
- overwriting adjudication-relevant records casually
- opaque scoring changes without documentation

---

## 12. Verification Baseline

At minimum, meaningful changes should be matched with appropriate checks:

| Change Type | Minimum Verification Expectation |
|------------|----------------------------------|
| Docs only | factual review |
| Type/logic changes | typecheck + targeted tests |
| Auth / tenant changes | targeted tests + manual review + risk disclosure |
| Dependency changes | install/build/test + rationale |
| Infra/config changes | parse/validate + blast radius statement |
| Governance changes | rule/hook validation + transcript |

---

## 13. Audit Baseline

Material changes should preserve enough evidence to answer:

- what changed?
- who approved it?
- what was verified?
- what remains uncertain?
- how do we roll it back?

The `MAGNUS_VERIFICATION_TRANSCRIPT_TEMPLATE.md` should be used for this purpose.

---

## 14. Security Escalation Triggers

If any of the following are detected, escalation is required:

- suspected secret leakage
- cross-tenant exposure risk
- auth bypass possibility
- production config ambiguity
- weakened CI gate
- unsafe dependency introduction
- compliance evidence corruption risk
- inability to determine actual blast radius

Escalation means:
- stop broad implementation
- disclose risk clearly
- obtain human direction

---

## 15. Final Principle

Magnus repositories should be hard to damage accidentally.

If the current setup makes unsafe actions easy and safe actions tedious, the security baseline is not strong enough.