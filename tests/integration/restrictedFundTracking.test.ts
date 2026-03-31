import { describe, expect, it } from 'vitest';
import { computeRestrictedFundStatus } from '@magnus/financial';

describe('Restricted Fund Tracking (deterministic)', () => {
  it('normal drawdown path computes remaining balance', () => {
    const res = computeRestrictedFundStatus({
      fund: {
        id: '11111111-1111-1111-1111-111111111111',
        totalRestrictedAmountUsd: 1000,
        startDate: new Date(Date.now() - 10 * 86400000).toISOString(),
        endDate: new Date(Date.now() + 20 * 86400000).toISOString(),
      },
      usageEvents: [
        { amountUsd: 250, occurredAt: new Date(Date.now() - 9 * 86400000).toISOString() },
        { amountUsd: 125.5, occurredAt: new Date(Date.now() - 2 * 86400000).toISOString() },
      ],
      nowIso: new Date().toISOString(),
    });

    expect(res.remainingBalanceUsd).toBeCloseTo(624.5, 2);
    expect(res.riskFlags.includes('OVERSPENT')).toBe(false);
  });

  it('over-spend path flags OVERSPENT', () => {
    const res = computeRestrictedFundStatus({
      fund: {
        id: '22222222-2222-2222-2222-222222222222',
        totalRestrictedAmountUsd: 1000,
        startDate: new Date(Date.now() - 10 * 86400000).toISOString(),
        endDate: new Date(Date.now() + 10 * 86400000).toISOString(),
      },
      usageEvents: [
        { amountUsd: 1200, occurredAt: new Date(Date.now() - 1 * 86400000).toISOString() },
      ],
      nowIso: new Date().toISOString(),
    });

    expect(res.remainingBalanceUsd).toBeLessThan(0);
    expect(res.riskFlags).toContain('OVERSPENT');
  });

  it('period-end under-spend risk flags UNDERSPEND_RISK when projected to leave meaningful balance', () => {
    const now = new Date();
    const start = new Date(now.getTime() - 100 * 86400000);
    const end = new Date(now.getTime() + 30 * 86400000); // <= 60 days remaining

    const res = computeRestrictedFundStatus({
      fund: {
        id: '33333333-3333-3333-3333-333333333333',
        totalRestrictedAmountUsd: 10000,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
      usageEvents: [
        { amountUsd: 1000, occurredAt: new Date(now.getTime() - 10 * 86400000).toISOString() },
      ],
      nowIso: now.toISOString(),
    });

    expect(res.riskFlags).toContain('UNDERSPEND_RISK');
  });

  it('flags PERIOD_ENDED_WITH_REMAINING_BALANCE when period is over and funds remain', () => {
    const now = new Date();
    const start = new Date(now.getTime() - 120 * 86400000);
    const end = new Date(now.getTime() - 1 * 86400000);

    const res = computeRestrictedFundStatus({
      fund: {
        id: '55555555-5555-5555-5555-555555555555',
        totalRestrictedAmountUsd: 5000,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
      usageEvents: [{ amountUsd: 3000, occurredAt: new Date(now.getTime() - 5 * 86400000).toISOString() }],
      nowIso: now.toISOString(),
    });

    expect(res.remainingBalanceUsd).toBeGreaterThan(0);
    expect(res.period.daysRemaining).toBe(0);
    expect(res.riskFlags).toContain('PERIOD_ENDED_WITH_REMAINING_BALANCE');
  });

  it('missing/invalid period dates fails closed with MISSING_PERIOD_DATES', () => {
    const res = computeRestrictedFundStatus({
      fund: {
        id: '44444444-4444-4444-4444-444444444444',
        totalRestrictedAmountUsd: 1000,
        startDate: new Date('invalid').toString(),
        endDate: new Date('invalid2').toString(),
      } as any,
      usageEvents: [],
      nowIso: new Date().toISOString(),
    });

    expect(res.riskFlags).toContain('MISSING_PERIOD_DATES');
  });
});

