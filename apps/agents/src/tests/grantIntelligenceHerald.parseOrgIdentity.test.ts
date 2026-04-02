import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOrgIdentityForGrantProfile } from '../agents/grantIntelligenceHerald/parseOrgIdentity';

test('parseOrgIdentityForGrantProfile reports missing inputs precisely', () => {
  const md = `
## Mission
- education

## Sector / NTEE
(missing)

## State footprint
CA
`.trim();

  const r = parseOrgIdentityForGrantProfile({ orgIdentityMarkdown: md, annualRevenueUsdSnapshot: null });
  assert.equal(r.profile, null);
  assert.ok(r.missing.includes('missing_ntee_code'));
  assert.ok(r.missing.includes('missing_annual_budget_usd'));
  assert.ok(!r.missing.includes('missing_primary_state'));
});

test('parseOrgIdentityForGrantProfile returns profile when required fields exist', () => {
  const md = `
## Mission
- education, youth

## Sector / NTEE
B20

## State footprint
CA, NY
`.trim();

  const r = parseOrgIdentityForGrantProfile({ orgIdentityMarkdown: md, annualRevenueUsdSnapshot: 123456 });
  assert.ok(r.profile);
  assert.equal(r.profile?.nteeCode, 'B20');
  assert.equal(r.profile?.primaryState, 'CA');
  assert.equal(r.profile?.annualBudgetUsd, 123456);
  assert.ok(Array.isArray(r.profile?.focusAreas));
});

