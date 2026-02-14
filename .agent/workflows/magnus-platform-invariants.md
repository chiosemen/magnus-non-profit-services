---
description: Magnus Platform Invariants
---

- DB access must be via @magnus/db only.
- No direct PrismaClient instantiation outside db package.
- Agent logic must include idempotency and dedupe keys.
- Feature gating must be back-end enforced.
