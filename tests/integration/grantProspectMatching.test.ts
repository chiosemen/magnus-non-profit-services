import { describe, expect, it } from 'vitest';
import { rankGrantProspects } from '@magnus/grants';

describe('Grant Prospect Matching (v1)', () => {
  it('ranks opportunities deterministically and explains factors', () => {
    const res = rankGrantProspects({
      input: {
        org: {
          nteeCode: 'B20',
          state: 'CA',
          annualBudgetUsd: 500_000,
          focusAreas: ['Education', 'Youth'],
        },
        program: { focusAreas: ['Education'] },
        ask: { amountUsd: 25_000 },
        maxResults: 10,
      },
      opportunities: [
        {
          id: 'opp-1',
          funderName: 'Alpha Foundation',
          funderEIN: '111111111',
          programName: 'Education Grants',
          description: 'Supports youth education programs.',
          focusAreas: ['Education'],
          eligibleNTEECodes: ['B20'],
          eligibleStates: ['CA'],
          minGrantAmount: 10_000,
          maxGrantAmount: 50_000,
          applicationDeadline: new Date(Date.now() + 10 * 86400000).toISOString(),
          isRollingDeadline: false,
          requiresLetterOfInquiry: true,
          acceptsUnsolicited: true,
          lastUpdated: new Date().toISOString(),
        },
        {
          id: 'opp-2',
          funderName: 'Beta Foundation',
          funderEIN: '222222222',
          programName: 'Other',
          description: 'Different focus.',
          focusAreas: ['Arts'],
          eligibleNTEECodes: ['A20'],
          eligibleStates: ['NY'],
          minGrantAmount: 10_000,
          maxGrantAmount: 50_000,
          isRollingDeadline: true,
          requiresLetterOfInquiry: false,
          acceptsUnsolicited: true,
          lastUpdated: new Date().toISOString(),
        },
      ],
    });

    expect(res.status).toBe('OK');
    expect(res.matches.length).toBe(1);
    expect(res.matches[0]!.funder_name).toBe('Alpha Foundation');
    expect(res.matches[0]!.match_score).toBeGreaterThan(50);
    expect(res.matches[0]!.match_reasons.join(' ')).toMatch(/NTEE|Focus|Geography|Deadline/i);
    expect(res.matches[0]!.factor_coverage.funder_type).toBe('UNKNOWN');
  });

  it('returns INSUFFICIENT_DATA when all candidates are excluded', () => {
    const res = rankGrantProspects({
      input: {
        org: {
          nteeCode: 'B20',
          state: 'CA',
          annualBudgetUsd: 500_000,
          focusAreas: ['Education'],
        },
        ask: { amountUsd: 500_000 }, // way above max
        maxResults: 10,
      },
      opportunities: [
        {
          id: 'opp-1',
          funderName: 'Alpha Foundation',
          programName: 'Education Grants',
          description: '',
          focusAreas: ['Education'],
          eligibleNTEECodes: ['B20'],
          eligibleStates: ['CA'],
          minGrantAmount: 10_000,
          maxGrantAmount: 50_000,
          isRollingDeadline: true,
          requiresLetterOfInquiry: false,
          acceptsUnsolicited: true,
          lastUpdated: new Date().toISOString(),
        },
      ],
    });

    expect(res.status).toBe('INSUFFICIENT_DATA');
    expect(res.matches).toHaveLength(0);
  });
});

