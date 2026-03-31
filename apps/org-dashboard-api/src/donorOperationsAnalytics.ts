/** Pure deterministic donor operations analytics (no ML, no scores). */

export type RawGift = {
  donorKey: string;
  amount: number;
  giftDate: Date;
  isRecurring: boolean;
  campaignId: string | null;
};

export type RawCampaign = { id: string; name: string };

export const DONOR_ANALYTICS_META = {
  minGiftsForStrongCoverage: 5,
  minDateSpanDaysStrong: 90,
  defaultLapsedAfterDays: 180,
  lookbackDays: 365,
  segmentLegend: {
    R: 'Recency (days since last gift): R3 ≤90d, R2 91–365d, R1 >365d',
    F: 'Frequency (gifts in last 365d): F1 = 1, F2 = 2–3, F3 ≥ 4',
    M: 'Monetary (sum in last 365d USD): M1 < $250, M2 $250–$2,499.99, M3 ≥ $2,500',
  },
} as const;

/** Truthful data readiness (no invented scores). */
export type DonorDataStatus = 'NOT_CONFIGURED' | 'INSUFFICIENT_DATA' | 'OK';

export type CoverageLevel = 'strong' | 'weak';

export const DONOR_COHORT_FORMULAS = {
  totalDonors: 'COUNT DISTINCT donorKey over all DonationGift rows for the org.',
  activeDonors: 'Donors whose most recent gift is within the last 365 days (UTC day boundaries).',
  lapsedDonors: 'Donors whose most recent gift is more than 180 days before as-of (configurable lapsedAfterDays).',
  segments:
    'RFM-style buckets from actual gifts: R from days since last gift; F = gift count in rolling 365d; M = sum USD in rolling 365d. Only donors with ≥1 gift in that window receive a segment row.',
  recurringDonorCount:
    'DISTINCT donorKey with at least one isRecurring gift in the rolling 365d window (not a prediction of future giving).',
  upgradeRules:
    'yoy_total_increase: calendar-year gift sum increased vs prior year. recurring_adopted_after_one_time: first recurring gift date after first one-time gift.',
} as const;

export type DonorOperationsSnapshot = {
  donorDataStatus: DonorDataStatus;
  coverage: { level: CoverageLevel; reasons: string[] };
  portfolio: {
    totalDonors: number;
    activeDonors: number;
    lapsedDonorCount: number;
    recurringDonorsDistinct365: number;
    recurringGiftsCount365: number;
    oneTimeGiftsCount365: number;
    activeDonorWindowDays: number;
    lapsedAfterDays: number;
  };
  formulas: typeof DONOR_COHORT_FORMULAS;
  meta: typeof DONOR_ANALYTICS_META;
  segments: Array<{
    segmentKey: string;
    donorCount: number;
    totalAmountLast365Usd: number;
    description: string;
  }>;
  lapsedDonors: Array<{ donorKey: string; lastGiftDate: string; daysSinceLastGift: number }>;
  recurringTrend: Array<{
    monthStart: string;
    recurringGiftCount: number;
    oneTimeGiftCount: number;
    recurringAmountUsd: number;
    oneTimeAmountUsd: number;
  }>;
  campaignSummary: Array<{
    campaignId: string;
    campaignName: string;
    giftCount: number;
    totalAmountUsd: number;
  }>;
  upgradeCandidates: Array<{ donorKey: string; ruleId: string; explanation: string }>;
};

function dayDiff(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addMonthsUtc(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

function emptyRecurringTrend(now: Date): DonorOperationsSnapshot['recurringTrend'] {
  const trendStart = startOfUtcMonth(addMonthsUtc(startOfUtcMonth(now), -11));
  const recurringTrend: DonorOperationsSnapshot['recurringTrend'] = [];
  for (let i = 0; i < 12; i++) {
    const m0 = addMonthsUtc(trendStart, i);
    recurringTrend.push({
      monthStart: m0.toISOString(),
      recurringGiftCount: 0,
      oneTimeGiftCount: 0,
      recurringAmountUsd: 0,
      oneTimeAmountUsd: 0,
    });
  }
  return recurringTrend;
}

function bucketR(daysSinceLast: number): 1 | 2 | 3 {
  if (daysSinceLast <= 90) return 3;
  if (daysSinceLast <= 365) return 2;
  return 1;
}

function bucketF(count365: number): 1 | 2 | 3 {
  if (count365 <= 1) return 1;
  if (count365 <= 3) return 2;
  return 3;
}

function bucketM(total365: number): 1 | 2 | 3 {
  if (total365 < 250) return 1;
  if (total365 < 2500) return 2;
  return 3;
}

export function computeDonorOperationsSnapshot(
  gifts: RawGift[],
  campaigns: RawCampaign[],
  now: Date,
  options?: { lapsedAfterDays?: number; activeDonorDays?: number }
): DonorOperationsSnapshot {
  const lapsedAfter = options?.lapsedAfterDays ?? DONOR_ANALYTICS_META.defaultLapsedAfterDays;
  const activeWindowDays = options?.activeDonorDays ?? 365;

  if (gifts.length === 0) {
    return {
      donorDataStatus: 'NOT_CONFIGURED',
      coverage: {
        level: 'weak',
        reasons: [
          'NOT_CONFIGURED: No donor gifts are stored for this organization. Load gifts via the donor operations API (or a future import) before cohort analytics apply.',
        ],
      },
      portfolio: {
        totalDonors: 0,
        activeDonors: 0,
        lapsedDonorCount: 0,
        recurringDonorsDistinct365: 0,
        recurringGiftsCount365: 0,
        oneTimeGiftsCount365: 0,
        activeDonorWindowDays: activeWindowDays,
        lapsedAfterDays: lapsedAfter,
      },
      formulas: DONOR_COHORT_FORMULAS,
      meta: DONOR_ANALYTICS_META,
      segments: [],
      lapsedDonors: [],
      recurringTrend: emptyRecurringTrend(now),
      campaignSummary: [],
      upgradeCandidates: [],
    };
  }

  const reasons: string[] = [];
  let level: CoverageLevel = 'strong';

  if (gifts.length < DONOR_ANALYTICS_META.minGiftsForStrongCoverage) {
    level = 'weak';
    reasons.push(
      `INSUFFICIENT_DATA: Fewer than ${DONOR_ANALYTICS_META.minGiftsForStrongCoverage} gifts recorded; segment and trend views are preliminary.`
    );
  }

  const sorted = [...gifts].sort((a, b) => a.giftDate.getTime() - b.giftDate.getTime());
  const first = sorted[0]!.giftDate;
  const last = sorted[sorted.length - 1]!.giftDate;
  const spanDays = dayDiff(last, first);
  if (spanDays < DONOR_ANALYTICS_META.minDateSpanDaysStrong) {
    level = 'weak';
    reasons.push(
      `INSUFFICIENT_DATA: Gift history spans less than ${DONOR_ANALYTICS_META.minDateSpanDaysStrong} days; year-over-year and cadence patterns may be incomplete.`
    );
  }

  const campaignNameById = new Map(campaigns.map(c => [c.id, c.name]));
  const lookbackStart = new Date(now.getTime() - DONOR_ANALYTICS_META.lookbackDays * 86_400_000);

  const byDonor = new Map<string, RawGift[]>();
  for (const g of gifts) {
    const list = byDonor.get(g.donorKey) ?? [];
    list.push(g);
    byDonor.set(g.donorKey, list);
  }
  for (const [, list] of byDonor) {
    list.sort((a, b) => a.giftDate.getTime() - b.giftDate.getTime());
  }

  const segmentAgg = new Map<string, { donors: Set<string>; total: number }>();
  const lapsedDonors: DonorOperationsSnapshot['lapsedDonors'] = [];

  for (const [donorKey, list] of byDonor) {
    const lastGift = list[list.length - 1]!;
    const daysSince = dayDiff(now, lastGift.giftDate);
    if (daysSince > lapsedAfter) {
      lapsedDonors.push({
        donorKey,
        lastGiftDate: lastGift.giftDate.toISOString(),
        daysSinceLastGift: daysSince,
      });
    }

    const in365 = list.filter(g => g.giftDate >= lookbackStart && g.giftDate <= now);
    if (in365.length === 0) continue;

    const total365 = in365.reduce((s, g) => s + g.amount, 0);
    const r = bucketR(daysSince);
    const f = bucketF(in365.length);
    const m = bucketM(total365);
    const segmentKey = `R${r}_F${f}_M${m}`;
    const cur = segmentAgg.get(segmentKey) ?? { donors: new Set<string>(), total: 0 };
    cur.donors.add(donorKey);
    cur.total += total365;
    segmentAgg.set(segmentKey, cur);
  }

  let activeDonors = 0;
  const recurringDonorsIn365 = new Set<string>();
  let recurringGiftsCount365 = 0;
  let oneTimeGiftsCount365 = 0;

  for (const [donorKey, list] of byDonor) {
    const lastGift = list[list.length - 1]!;
    const daysSince = dayDiff(now, lastGift.giftDate);
    if (daysSince <= activeWindowDays) activeDonors += 1;
  }

  for (const g of gifts) {
    if (g.giftDate < lookbackStart || g.giftDate > now) continue;
    if (g.isRecurring) {
      recurringGiftsCount365 += 1;
      recurringDonorsIn365.add(g.donorKey);
    } else {
      oneTimeGiftsCount365 += 1;
    }
  }

  const segments = Array.from(segmentAgg.entries())
    .map(([segmentKey, v]) => {
      const [rPart, fPart, mPart] = segmentKey.split('_');
      const rNum = parseInt(rPart!.replace('R', ''), 10);
      const fNum = parseInt(fPart!.replace('F', ''), 10);
      const mNum = parseInt(mPart!.replace('M', ''), 10);
      const description = `Recency R${rNum} (${DONOR_ANALYTICS_META.segmentLegend.R}), Frequency F${fNum} (${DONOR_ANALYTICS_META.segmentLegend.F}), Monetary M${mNum} (${DONOR_ANALYTICS_META.segmentLegend.M})`;
      return {
        segmentKey,
        donorCount: v.donors.size,
        totalAmountLast365Usd: Math.round(v.total * 100) / 100,
        description,
      };
    })
    .sort((a, b) => a.segmentKey.localeCompare(b.segmentKey));

  const trendStart = startOfUtcMonth(addMonthsUtc(startOfUtcMonth(now), -11));
  const recurringTrend: DonorOperationsSnapshot['recurringTrend'] = [];

  for (let i = 0; i < 12; i++) {
    const m0 = addMonthsUtc(trendStart, i);
    const m1 = addMonthsUtc(trendStart, i + 1);
    const inMonth = gifts.filter(g => g.giftDate >= m0 && g.giftDate < m1);
    let rc = 0;
    let oc = 0;
    let ra = 0;
    let oa = 0;
    for (const g of inMonth) {
      if (g.isRecurring) {
        rc += 1;
        ra += g.amount;
      } else {
        oc += 1;
        oa += g.amount;
      }
    }
    recurringTrend.push({
      monthStart: m0.toISOString(),
      recurringGiftCount: rc,
      oneTimeGiftCount: oc,
      recurringAmountUsd: Math.round(ra * 100) / 100,
      oneTimeAmountUsd: Math.round(oa * 100) / 100,
    });
  }

  const campaignSummaryMap = new Map<string, { giftCount: number; totalAmountUsd: number }>();
  for (const g of gifts) {
    if (!g.campaignId) continue;
    const cur = campaignSummaryMap.get(g.campaignId) ?? { giftCount: 0, totalAmountUsd: 0 };
    cur.giftCount += 1;
    cur.totalAmountUsd += g.amount;
    campaignSummaryMap.set(g.campaignId, cur);
  }
  const campaignSummary = Array.from(campaignSummaryMap.entries()).map(([campaignId, v]) => ({
    campaignId,
    campaignName: campaignNameById.get(campaignId) ?? campaignId,
    giftCount: v.giftCount,
    totalAmountUsd: Math.round(v.totalAmountUsd * 100) / 100,
  }));

  const upgradeCandidates: DonorOperationsSnapshot['upgradeCandidates'] = [];
  const y0 = now.getUTCFullYear();
  for (const [donorKey, list] of byDonor) {
    const sumYear = (y: number) =>
      list.filter(g => g.giftDate.getUTCFullYear() === y).reduce((s, g) => s + g.amount, 0);
    const lastYear = sumYear(y0 - 1);
    const prior = sumYear(y0 - 2);
    if (lastYear > 0 && prior > 0 && lastYear > prior) {
      upgradeCandidates.push({
        donorKey,
        ruleId: 'yoy_total_increase',
        explanation: `Total gifts in ${y0 - 1} ($${lastYear.toFixed(2)}) exceeded ${y0 - 2} ($${prior.toFixed(2)}).`,
      });
    }

    const sortedG = [...list].sort((a, b) => a.giftDate.getTime() - b.giftDate.getTime());
    const firstRecurring = sortedG.find(g => g.isRecurring);
    const firstOneTime = sortedG.find(g => !g.isRecurring);
    if (firstRecurring && firstOneTime && firstRecurring.giftDate.getTime() > firstOneTime.giftDate.getTime()) {
      const already = upgradeCandidates.some(
        c => c.donorKey === donorKey && c.ruleId === 'recurring_adopted_after_one_time'
      );
      if (!already) {
        upgradeCandidates.push({
          donorKey,
          ruleId: 'recurring_adopted_after_one_time',
          explanation:
            'Donor gave one-time gifts first, then recorded at least one recurring gift on a later date (rule-based signal only).',
        });
      }
    }
  }

  const donorDataStatus: DonorDataStatus = level === 'strong' ? 'OK' : 'INSUFFICIENT_DATA';

  return {
    donorDataStatus,
    coverage: { level, reasons },
    portfolio: {
      totalDonors: byDonor.size,
      activeDonors,
      lapsedDonorCount: lapsedDonors.length,
      recurringDonorsDistinct365: recurringDonorsIn365.size,
      recurringGiftsCount365,
      oneTimeGiftsCount365,
      activeDonorWindowDays: activeWindowDays,
      lapsedAfterDays: lapsedAfter,
    },
    formulas: DONOR_COHORT_FORMULAS,
    meta: DONOR_ANALYTICS_META,
    segments,
    lapsedDonors: lapsedDonors.sort((a, b) => b.daysSinceLastGift - a.daysSinceLastGift),
    recurringTrend,
    campaignSummary,
    upgradeCandidates,
  };
}
