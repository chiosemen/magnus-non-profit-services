import { describe, expect, it } from 'vitest';
import { computeDonorOperationsSnapshot } from '../../apps/org-dashboard-api/src/donorOperationsAnalytics';

describe('donorOperationsAnalytics (deterministic)', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');

  it('NOT_CONFIGURED when no gifts', () => {
    const snap = computeDonorOperationsSnapshot([], [], now);
    expect(snap.donorDataStatus).toBe('NOT_CONFIGURED');
    expect(snap.portfolio.totalDonors).toBe(0);
    expect(snap.coverage.reasons.some(r => r.includes('NOT_CONFIGURED'))).toBe(true);
    expect(snap.segments).toHaveLength(0);
    expect(snap.recurringTrend).toHaveLength(12);
  });

  it('INSUFFICIENT_DATA when few gifts and short span', () => {
    const gifts = [
      {
        donorKey: 'a',
        amount: 100,
        giftDate: new Date('2026-06-01T12:00:00.000Z'),
        isRecurring: false,
        campaignId: null,
      },
    ];
    const snap = computeDonorOperationsSnapshot(gifts, [], now);
    expect(snap.donorDataStatus).toBe('INSUFFICIENT_DATA');
    expect(snap.coverage.level).toBe('weak');
    expect(snap.coverage.reasons.some(r => r.includes('INSUFFICIENT_DATA'))).toBe(true);
    expect(snap.portfolio.totalDonors).toBe(1);
    expect(snap.portfolio.activeDonors).toBe(1);
  });

  it('OK when enough gifts and date span', () => {
    const gifts = [
      { donorKey: 'd1', amount: 10, giftDate: new Date('2025-01-01T12:00:00.000Z'), isRecurring: false, campaignId: null },
      { donorKey: 'd2', amount: 20, giftDate: new Date('2025-03-01T12:00:00.000Z'), isRecurring: false, campaignId: null },
      { donorKey: 'd3', amount: 30, giftDate: new Date('2025-05-01T12:00:00.000Z'), isRecurring: false, campaignId: null },
      { donorKey: 'd4', amount: 40, giftDate: new Date('2025-07-01T12:00:00.000Z'), isRecurring: false, campaignId: null },
      { donorKey: 'd5', amount: 50, giftDate: new Date('2026-06-01T12:00:00.000Z'), isRecurring: true, campaignId: null },
    ];
    const snap = computeDonorOperationsSnapshot(gifts, [], now);
    expect(snap.donorDataStatus).toBe('OK');
    expect(snap.coverage.level).toBe('strong');
    expect(snap.portfolio.totalDonors).toBe(5);
    expect(snap.portfolio.recurringDonorsDistinct365).toBe(1);
    expect(snap.portfolio.recurringGiftsCount365).toBe(1);
  });

  it('lapsed donor when last gift beyond lapsedAfterDays', () => {
    const gifts = [
      {
        donorKey: 'old',
        amount: 100,
        giftDate: new Date('2025-01-01T12:00:00.000Z'),
        isRecurring: false,
        campaignId: null,
      },
      ...[2, 3, 4, 5].map((n, i) => ({
        donorKey: `d${n}`,
        amount: 10,
        giftDate: new Date(`2025-0${i + 2}-15T12:00:00.000Z`),
        isRecurring: false,
        campaignId: null as string | null,
      })),
    ];
    const snap = computeDonorOperationsSnapshot(gifts, [], now, { lapsedAfterDays: 180 });
    const lapsed = snap.lapsedDonors.find(l => l.donorKey === 'old');
    expect(lapsed).toBeDefined();
    expect(lapsed!.daysSinceLastGift).toBeGreaterThan(180);
    expect(snap.portfolio.lapsedDonorCount).toBeGreaterThanOrEqual(1);
  });

  it('recurring 365d counts distinct donors and gift rows', () => {
    const gifts = [
      { donorKey: 'x', amount: 5, giftDate: new Date('2026-05-01T12:00:00.000Z'), isRecurring: true, campaignId: null },
      { donorKey: 'x', amount: 5, giftDate: new Date('2026-05-15T12:00:00.000Z'), isRecurring: true, campaignId: null },
      { donorKey: 'y', amount: 10, giftDate: new Date('2026-05-10T12:00:00.000Z'), isRecurring: false, campaignId: null },
      { donorKey: 'z', amount: 1, giftDate: new Date('2024-01-01T12:00:00.000Z'), isRecurring: true, campaignId: null },
      { donorKey: 'w', amount: 1, giftDate: new Date('2025-06-01T12:00:00.000Z'), isRecurring: false, campaignId: null },
    ];
    const snap = computeDonorOperationsSnapshot(gifts, [], now);
    expect(snap.portfolio.recurringDonorsDistinct365).toBe(1);
    expect(snap.portfolio.recurringGiftsCount365).toBe(2);
    expect(snap.portfolio.oneTimeGiftsCount365).toBe(1);
  });

  it('YoY upgrade candidate when last year exceeds prior year', () => {
    const gifts = [
      {
        donorKey: 'donor1',
        amount: 100,
        giftDate: new Date('2024-06-01T12:00:00.000Z'),
        isRecurring: false,
        campaignId: null,
      },
      {
        donorKey: 'donor1',
        amount: 200,
        giftDate: new Date('2025-06-01T12:00:00.000Z'),
        isRecurring: false,
        campaignId: null,
      },
      ...[2, 3, 4, 5].map((n, i) => ({
        donorKey: `pad${n}`,
        amount: 50,
        giftDate: new Date(`2025-0${i + 1}-10T12:00:00.000Z`),
        isRecurring: false,
        campaignId: null as string | null,
      })),
    ];
    const snap = computeDonorOperationsSnapshot(gifts, [], now);
    const yoY = snap.upgradeCandidates.filter(c => c.ruleId === 'yoy_total_increase');
    expect(yoY.some(c => c.donorKey === 'donor1')).toBe(true);
  });

  it('recurring_adopted_after_one_time upgrade rule', () => {
    const gifts = [
      { donorKey: 'r1', amount: 50, giftDate: new Date('2025-01-01T12:00:00.000Z'), isRecurring: false, campaignId: null },
      { donorKey: 'r1', amount: 10, giftDate: new Date('2025-06-01T12:00:00.000Z'), isRecurring: true, campaignId: null },
      ...[2, 3, 4, 5].map((n, i) => ({
        donorKey: `p${n}`,
        amount: 20,
        giftDate: new Date(`2025-0${i + 2}-01T12:00:00.000Z`),
        isRecurring: false,
        campaignId: null as string | null,
      })),
    ];
    const snap = computeDonorOperationsSnapshot(gifts, [], now);
    expect(snap.upgradeCandidates.some(c => c.ruleId === 'recurring_adopted_after_one_time' && c.donorKey === 'r1')).toBe(true);
  });

  it('groups campaign gifts in campaign summary', () => {
    const gifts = [
      {
        donorKey: 'x',
        amount: 50,
        giftDate: new Date('2026-05-01T12:00:00.000Z'),
        isRecurring: false,
        campaignId: 'camp-uuid',
      },
      {
        donorKey: 'y',
        amount: 75,
        giftDate: new Date('2026-05-02T12:00:00.000Z'),
        isRecurring: false,
        campaignId: 'camp-uuid',
      },
      ...[1, 2, 3].map(i => ({
        donorKey: `e${i}`,
        amount: 100,
        giftDate: new Date(`2025-0${i + 1}-01T12:00:00.000Z`),
        isRecurring: false,
        campaignId: null as string | null,
      })),
    ];
    const snap = computeDonorOperationsSnapshot(gifts, [{ id: 'camp-uuid', name: 'Spring Appeal' }], now);
    expect(snap.campaignSummary).toHaveLength(1);
    expect(snap.campaignSummary[0]!.campaignName).toBe('Spring Appeal');
    expect(snap.campaignSummary[0]!.giftCount).toBe(2);
    expect(snap.campaignSummary[0]!.totalAmountUsd).toBe(125);
  });

  it('exports cohort formulas on snapshot', () => {
    const snap = computeDonorOperationsSnapshot([], [], now);
    expect(snap.formulas.totalDonors).toContain('DISTINCT');
  });
});
