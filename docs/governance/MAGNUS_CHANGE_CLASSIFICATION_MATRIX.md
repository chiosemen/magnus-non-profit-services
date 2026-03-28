# MAGNUS_CHANGE_CLASSIFICATION_MATRIX.md

Defines how Magnus agents categorize changes.

| Class | Risk Level | Examples | Agent Behavior |
|------|-------------|----------|---------------|
| A | Critical | auth, billing, infra, CI/CD, destructive migrations | Requires explicit human approval |
| B | Guarded | new APIs, schema additions, refactors | Allowed if scope explicitly authorizes |
| C | Routine | small bug fixes, docs, minor tests | Allowed normally |

---

## Class A Examples

- authentication logic
- authorization policy
- tenant isolation
- billing systems
- infrastructure configs
- CI/CD pipeline
- dependency upgrades with runtime impact
- schema migrations with destructive potential

---

## Class B Examples

- API additions
- configuration updates
- schema expansions
- moderate refactors
- monitoring updates

---

## Class C Examples

- documentation edits
- type fixes
- small bug fixes
- localized tests