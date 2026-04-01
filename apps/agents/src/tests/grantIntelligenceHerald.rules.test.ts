import test from 'node:test';
import assert from 'node:assert/strict';
import { runGrantIntelligenceHeraldRules } from '../agents/grantIntelligenceHerald/rules';
import type { GrantMatch } from '../agents/grantIntelligenceHerald/opportunityClient';

function ctx() {
  return {
    agentName: 'GrantIntelligenceHerald' as const,
    scope: { type: 'org' as const, id: 'org-1' },
    window: { start: new Date('2026-06-01T00:00:00Z'), end: new Date('2026-06-08T00:00:00Z') },
  };
}

function match(overrides: Partial<GrantMatch>): GrantMatch {
  return {
    opportunity: {
      id: 'opp-1',
      funderName: 'Funder A',
      programName: 'Program 1',
      description: '',
      focusAreas: ['education'],
      eligibleNTEECodes: ['B20'],
      eligibleStates: ['CA'],
      minGrantAmount: 5000,
      maxGrantAmount: 25000,
      totalGiving: 0,
      isRollingDeadline: false,
      requiresLetterOfInquiry: true,
      averageGrantSize: 0,
      grantCount: 0,
      acceptsUnsolicited: true,
      lastUpdated: new Date('2026-06-01T00:00:00Z').toISOString(),
      applicationUrl: 'https://example.invalid/apply',
      applicationDeadline: '2026-07-01',
    },
    matchScore: 75,
    matchReasons: ['NTEE code is eligible', 'State is eligible'],
    missingCriteria: [],
    urgency: 'high',
    recommendedAction: 'Prepare LOI',
    ...overrides,
  };
}

test('HERALD packet alert emitted and LOI prep triggered only for LOI+threshold matches', () => {
  const r = runGrantIntelligenceHeraldRules({
    ctx: ctx(),
    org: { id: 'org-1', name: 'Test Org', ein: '12-3456789' },
    orgIdentityFileId: 'file-1',
    matches: [
      match({ opportunity: { ...(match({}).opportunity), id: 'opp-loi', requiresLetterOfInquiry: true }, matchScore: 60 }),
      match({ opportunity: { ...(match({}).opportunity), id: 'opp-nonloi', requiresLetterOfInquiry: false }, matchScore: 95 }),
      match({ opportunity: { ...(match({}).opportunity), id: 'opp-low', requiresLetterOfInquiry: true }, matchScore: 55 }),
    ],
  });

  assert.equal(r.alerts.length, 1);
  assert.equal(r.alerts[0]?.type, 'HERALD_GRANT_OPPORTUNITY_REVIEW_PACKET');
  assert.ok(String(r.alerts[0]?.body).includes('Source index'));
  assert.ok(String(r.alerts[0]?.body).includes('example.invalid'));

  assert.deepEqual(r.loiPrepOpportunityIds, ['opp-loi']);
});

