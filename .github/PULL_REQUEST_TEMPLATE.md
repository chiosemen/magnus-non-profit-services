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

## Gate Integrity (every new or changed test/check)
Three vacuous gates were found in this repo in a single day: `pnpm test` that
discovered zero tests and exited 0; a staging check that passed against a build
with no middleware; and a regex guard whose `[^}]*` stopped at a nested brace,
so it matched nothing it was written to catch. A gate that cannot fail is worse
than no gate — it reports safety.

- [ ] Every new/changed test or check was RUN against the defective state and
      OBSERVED TO FAIL (paste the failing output, or the commit/SHA it was run
      against). "It passes" is not evidence.
- [ ] No check can pass by discovering nothing (zero files, zero rows, zero
      assertions) — a scan that matches nothing fails.
- [ ] The check discriminates the specific defect, not a symptom something else
      also produces.

## Rollback Plan
How to safely revert this change in production.

