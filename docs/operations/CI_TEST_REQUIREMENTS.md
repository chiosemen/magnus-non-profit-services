# Magnus Accord CI Test Requirements

## Overview

This document describes the test infrastructure and CI environment requirements for running the Magnus Accord test suite.

## Test Categories

### 1. Unit Tests (CI-Safe, No DB Required)

These tests run in any CI environment without external dependencies:

| Package | Tests | Notes |
|---------|-------|-------|
| `@magnus/auth` | 2 | JWT middleware validation |
| `@magnus/config` | 6 | Env validation, fail-closed behavior |
| `@magnus/db` | 7 | Encryption logic, schema guards, format validation |
| `@magnus/subscription` | 13 | Tier guards, feature gating |
| `@magnus/org-autonomous-ops-context` | 66 | Context derivation, pilot readiness |
| `@magnus/claude-partner` | 6 | Usage audit, cap enforcement |

**Total Unit Tests: ~100**

### 2. Integration Tests (Require DATABASE_URL)

These tests require a valid database connection and are **automatically skipped** when:
- `DATABASE_URL` is not set
- Database connection fails

| Package | Tests | Notes |
|---------|-------|-------|
| `@magnus/db` | 3 | Encryption round-trip with Prisma |

**Behavior**: Integration tests register as `SKIP` in CI output, not as failures.

## CI Environment Variables

### Required for All Tests

None. Unit tests are self-contained.

### Required for Integration Tests

```bash
# PostgreSQL connection string
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Encryption key for field-level encryption tests
ENCRYPTION_KEY=<64 hex characters>
```

### Optional

```bash
# Per-agent kill switches (default: undefined = disabled)
AGENT_ENABLE_COMPLIANCE_WATCHDOG=true
AGENT_ENABLE_GRANT_MANAGER=true
AGENT_ENABLE_FINANCIAL_SENTINEL=true
AGENT_ENABLE_BOARD_ORACLE=true
AGENT_ENABLE_GRANT_HERALD=true
AGENT_ENABLE_WORKER_INCOME_OPTIMIZER=true
```

## Running Tests

### Full Suite
```bash
pnpm -r --if-present test
```

### Single Package
```bash
pnpm test --filter @magnus/db
pnpm test --filter @magnus/auth
```

### With Integration Tests
```bash
# Set DATABASE_URL and ENCRYPTION_KEY first
export DATABASE_URL=postgresql://...
export ENCRYPTION_KEY=$(openssl rand -hex 32)
pnpm test --filter @magnus/db
```

## CI Pipeline Recommendations

### GitHub Actions Secrets

For full integration test coverage, configure these secrets:
- `DATABASE_URL` - Staging/test database connection
- `ENCRYPTION_KEY` - Test encryption key (can be generated per-run)

### Example Workflow Addition

```yaml
- name: Run tests with integration
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
    ENCRYPTION_KEY: ${{ secrets.ENCRYPTION_KEY }}
  run: pnpm -r --if-present test
```

## Test Output Interpretation

| Status | Meaning |
|--------|---------|
| `pass` | Test completed successfully |
| `fail` | Test assertion failed |
| `skip` | Test skipped (integration test without DB) |

**Acceptable CI State**: All `pass` + some `skip` for integration tests = GREEN

## Fail-Closed Behavior

All tests verify fail-closed behavior:
- Missing env vars throw immediately
- Invalid credentials reject requests
- Schema mismatches fail loudly
- No silent fallbacks to mock data
