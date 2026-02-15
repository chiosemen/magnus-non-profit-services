## Magnus Platform PR Checklist

### Core Invariants
- [ ] No direct PrismaClient instantiation outside @magnus/db
- [ ] No cross-app imports
- [ ] No direct process.env usage (must use @magnus/config)
- [ ] No browser-era tooling
- [ ] Auth is fail-closed

### CI
- [ ] pnpm install passes
- [ ] pnpm build passes
- [ ] pnpm -r test runs
- [ ] pnpm -r exec tsc --noEmit passes

### Env
- [ ] All 7 apps call validateEnv()
- [ ] No .env committed

### Database
- [ ] Migrations validated
- [ ] No schema drift

