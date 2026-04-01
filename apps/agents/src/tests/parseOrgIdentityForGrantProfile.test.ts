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
  assert.ok(parsed);
  assert.equal(parsed!.nteeCode, 'B20');
  assert.equal(parsed!.primaryState, 'CA');
  assert.equal(parsed!.annualBudgetUsd, 120000);
  assert.ok(parsed!.focusAreas.length > 0);
});

test('parseOrgIdentityForGrantProfile returns null when required fields missing', () => {
  const md = ['# ORG_IDENTITY', '', '## Mission', 'x', '', '## Sector / NTEE', '(Add)'].join('\n');
  const parsed = parseOrgIdentityForGrantProfile({ orgIdentityMarkdown: md, annualRevenueUsdSnapshot: null });
  assert.equal(parsed, null);
});

