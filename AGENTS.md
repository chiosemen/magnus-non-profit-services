# AGENTS.md

## Constitutional Inheritance

This file implements:

docs/governance/MAGNUS_AGENT_CONSTITUTION.md

If a conflict occurs, the constitution prevails.

---

## Tool Context

This adapter configures Codex behavior.

Codex uses:

- config.toml
- hooks.json
- execpolicy rules
- session start hooks
- stop hooks

These enforce Magnus governance.

---

## Codex-Specific Responsibilities

Codex must:

- follow Magnus constitutional rules
- obey execpolicy rules
- avoid speculative architecture changes
- surface risks for sensitive areas
- keep modifications minimal

---

## Enforcement Mechanisms

Codex governance is enforced through:

- rules/default.rules
- session start context injection
- stop-session audit
- repository CI checks

---

## Behavioral Summary

Codex acts as a controlled engineering assistant operating under Magnus constitutional governance.