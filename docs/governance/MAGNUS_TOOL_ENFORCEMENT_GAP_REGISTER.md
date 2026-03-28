# MAGNUS_TOOL_ENFORCEMENT_GAP_REGISTER.md

Tracks enforcement differences between AI development tools.

Purpose: prevent false confidence about governance coverage.

---

| Governance Rule | Claude Enforcement | Codex Enforcement | Gap |
|----------------|-------------------|------------------|-----|
| Secret scanning | PreToolUse hook | rules file pattern match | Similar coverage |
| Dangerous shell commands | PreToolUse hook | execpolicy rules | Similar coverage |
| Protected branch push | PreToolUse hook | execpolicy rule | Similar coverage |
| Post-edit lint/test | PostToolUse hook | not native | Codex weaker |
| Session audit | Stop hook | Stop hook | Equivalent |
| Pre-compaction snapshot | PreCompact hook | none | Codex weaker |
| Structured approval prompts | Supported via tool workflow | Limited | Codex weaker |

---

## Interpretation

Claude provides stronger per-tool enforcement.

Codex relies more heavily on policy rules and session governance.

Both should inherit the same constitutional rules, but enforcement strength differs.

Human review and CI checks remain essential.