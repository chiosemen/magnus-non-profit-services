# CLAUDE.md

## Constitutional Inheritance

This file implements the rules defined in:

docs/governance/MAGNUS_AGENT_CONSTITUTION.md

If any conflict exists, the constitution prevails.

---

## Tool Context

This file adapts Magnus governance to Claude Code.

Claude uses:

- settings.json hooks
- PreToolUse
- PostToolUse
- PreCompact
- Stop hooks

These hooks enforce constitutional policies.

---

## Claude-Specific Responsibilities

Claude must:

- respect Magnus security rules
- avoid speculative implementation
- disclose risk when touching sensitive areas
- keep patches minimal
- follow repository conventions

---

## Claude Enforcement Hooks

Claude hooks enforce:

- secret scanning
- shell safety
- branch protection
- post-write lint/type/test
- session audit
- context snapshot before compaction

---

## Behavioral Summary

Claude acts as a controlled engineering assistant and must follow the Magnus constitution at all times.

### Deployment Targets by Vertical

```
Magnus Findr / Scraping workers  → Apify Platform + GCP Cloud Run
Magnus Compliance / MARP SaaS   → Vercel (frontend) + Railway/GCP (API)
Magnus Trading / Real-time       → GCP Cloud Run (low-latency)
Magnus CaaS / Tax Platform       → Vercel + Supabase
Mobile (React Native)            → Expo EAS Build + App Stores
```

---

## 🧠 Claude Code Behavior Rules

### In this project, Claude MUST:

1. **Read this CLAUDE.md** at the start of every session
2. **Complete the Feature Spec** before writing implementation code
3. **Run the pre-commit audit** before any `git commit`
4. **Never push directly to main** — always use feature branches
5. **Write tests first** (TDD preferred) or alongside implementation
6. **Use existing patterns** — check /packages/shared before writing new utilities
7. **Validate all inputs** using the project's established schema library
8. **Log security-relevant events** using the project's structured logger

### In this project, Claude MUST NOT:

1. Generate code with hardcoded credentials or API keys
2. Skip input validation on any user-facing endpoint
3. Write raw SQL without parameterization
4. Create public-facing database connections
5. Use `eval()`, `exec()`, or similar dynamic execution
6. Commit without running the full pre-commit audit gate
7. Ignore failing tests and push anyway
8. Expose internal error messages/stack traces to API responses

---

## 📎 Project-Specific Context

> Fill this section per vertical when deploying this template.

### {{PROJECT_NAME}} Specifics

```
Key Business Logic:    {{DESCRIBE_CORE_LOGIC}}
External APIs Used:    {{LIST_EXTERNAL_APIS}}
Critical Data Models:  {{LIST_KEY_MODELS}}
Known Constraints:     {{TECH_OR_BUSINESS_CONSTRAINTS}}
Current Sprint Focus:  {{CURRENT_WORK_FOCUS}}
```

### Active Feature Flags

```
{{FEATURE_FLAG_NAME}}: enabled/disabled — {{DESCRIPTION}}
```

### Integration Points

```
{{INTEGRATION_NAME}}: {{DESCRIPTION}} ({{STATUS: active/planned/deprecated}})
```

---

## 🔗 Reference Links

- Magnus Brand Security Policy: internal/security-policy.md
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- Magnus GitHub Org: https://github.com/{{GITHUB_ORG}}
- Deployment Dashboard: {{DEPLOYMENT_DASHBOARD_URL}}
- Internal Docs: {{NOTION_OR_DOCS_URL}}

---

*Last updated: {{DATE}} | Claude Code session will auto-read this file on start*
