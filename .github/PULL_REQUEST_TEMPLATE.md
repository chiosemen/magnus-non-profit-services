## Description
What does this change do, and why?

## Invariant Impact
- PrismaClient instantiation outside @magnus/db: Yes/No (explain)
- Cross-app imports introduced: Yes/No (explain)
- Direct process.env usage added: Yes/No (explain)
- Auth fail-closed preserved: Yes/No (explain)

## Migration Impact
- Schema changes: Yes/No (must be No)
- Migrations added/changed: Yes/No (list)
- Additive-only verified: Yes/No

## Env Impact
- New env vars: Yes/No (list)
- Updated templates: Yes/No (paths)
- validateEnv coverage: Confirm all 7 apps still call validateEnv()

## Rollback Plan
How to safely revert this change in production.

