import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOrgIdentityForGrantProfile } from '../agents/grantIntelligenceHerald/parseOrgIdentity';

test('parseOrgIdentityForGrantProfile extracts NTEE and state codes from ORG_IDENTITY', () => {
  const md = [
    '# ORG_IDENTITY',
    '',
    '## Mission',
    '- education, workforce',
    '',
    '## Sector / NTEE',
    'Primary NTEE: B20',
    '',
    '## State footprint',
    'CA, NV',
  ].join('\n');

  const parsed = parseOrgIdentityForGrantProfile({ orgIdentityMarkdown: md, annualRevenueUsdSnapshot: 120000 });
  assert.ok(parsed.profile);
  assert.equal(parsed.profile!.nteeCode, 'B20');
  assert.equal(parsed.profile!.primaryState, 'CA');
  assert.equal(parsed.profile!.annualBudgetUsd, 120000);
  assert.ok(parsed.profile!.focusAreas.length > 0);
});

test('parseOrgIdentityForGrantProfile reports missing when required fields missing', () => {
  const md = ['# ORG_IDENTITY', '', '## Mission', 'x', '', '## Sector / NTEE', '(Add)'].join('\n');
  const parsed = parseOrgIdentityForGrantProfile({ orgIdentityMarkdown: md, annualRevenueUsdSnapshot: null });
  assert.equal(parsed.profile, null);
  assert.ok(parsed.missing.includes('missing_ntee_code') || parsed.missing.includes('missing_primary_state'));
  assert.ok(parsed.missing.includes('missing_annual_budget_usd'));
});

