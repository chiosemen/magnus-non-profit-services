import { PrismaClient, ComplianceStatus, EventRegistrationStatus } from '@magnus/db/types';
import { getFundBalanceReport, getIncomeExpenseReport } from './fundAccountingService';
import { buildFinancialSummary } from './financialSummary';

export interface BoardPacketDto {
  orgId: string;
  asOfIso: string;
  executiveSummary: {
    title: string;
    generatedAt: string;
    description: string;
  };
  financialSummary: {
    activeSentinelAlertsCount: number;
    financialReportStatus: string;
    netChange: number;
  };
  fundBalanceSummary: any;
  campaignPerformance: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    goalAmount: number | null;
    totalRaised: number;
    donationsCount: number;
  }>;
  donorActivity: {
    totalDonorsCount: number;
    totalDonationsCount: number;
    totalDonationsAmount: number;
    averageDonationAmount: number;
  };
  grantMilestones: Array<{
    id: string;
    funderName: string;
    totalAmount: number;
    spentToDate: number;
    startDate: string;
    endDate: string;
    percentSpent: number;
  }>;
  complianceObligations: {
    totalDeadlinesCount: number;
    pendingCount: number;
    inProgressCount: number;
    filedCount: number;
    deadlines: Array<{
      id: string;
      deadlineType: string;
      dueDateIso: string;
      status: string;
    }>;
  };
  volunteerEventImpact: {
    totalVolunteersCount: number;
    totalHoursLogged: number;
    totalEventsCount: number;
    totalRegistrationsCount: number;
  };
  openRisksAndAlerts: Array<{
    id: string;
    severity: string;
    title: string;
    body: string;
    createdAtIso: string;
  }>;
  recommendedBoardActions: Array<{
    id: string;
    fromAgentName: string;
    title: string;
    body: string;
    requiresHumanReview: boolean;
  }>;
  appendixAuditReferences: {
    details: string;
    sourceReferences: string[];
  };
  aiNarrative: {
    content: string | null;
    status: 'ENABLED_DRAFT' | 'DISABLED' | 'NO_INSIGHTS';
  };
}

export async function buildBoardPacket(
  db: PrismaClient,
  orgId: string,
  options: { includeAiNarrative?: boolean; now?: Date } = {}
): Promise<BoardPacketDto> {
  if (!orgId) throw new Error('Organization context is missing.');
  const now = options.now ?? new Date();

  // 1. Executive Summary
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  });
  const orgName = org?.name ?? 'Unknown Organization';

  // 2. Fund Balance Summary
  let fundBalanceReport: any = 'unavailable';
  try {
    fundBalanceReport = await getFundBalanceReport(db, orgId, {});
  } catch (err) {
    // Graceful handling
  }

  // 3. Income/Expense report
  let incomeExpenseReport: any = [];
  try {
    incomeExpenseReport = await getIncomeExpenseReport(db, orgId, {});
  } catch (err) {
    // Graceful handling
  }
  const netChange = incomeExpenseReport.reduce((acc: number, row: any) => acc + (Number(row.amount) || 0), 0);

  // 4. Financial alerts (using buildFinancialSummary)
  let financialSummaryData: any = null;
  try {
    financialSummaryData = await buildFinancialSummary({ db, orgId, now });
  } catch (err) {
    // Graceful handling
  }
  const activeSentinelAlertsCount = financialSummaryData?.sentinelActiveAlerts?.length ?? 0;

  // 5. Campaigns & Performance
  const campaigns = await db.campaign.findMany({
    where: { orgId },
    include: { donations: true },
  });
  const campaignPerformance = campaigns.map(c => {
    const totalRaised = c.donations.reduce((sum, d) => sum + Number(d.amount), 0);
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      status: c.status,
      goalAmount: c.goalAmount ? Number(c.goalAmount) : null,
      totalRaised,
      donationsCount: c.donations.length,
    };
  });

  // 6. Donors & Donations
  const donorsCount = await db.donor.count({ where: { orgId } });
  const donations = await db.donation.findMany({ where: { orgId } });
  const totalDonationsAmount = donations.reduce((sum, d) => sum + Number(d.amount), 0);
  const averageDonationAmount = donations.length > 0 ? totalDonationsAmount / donations.length : 0;

  // 7. Grants
  const grants = await db.grant.findMany({ where: { orgId } });
  const grantMilestones = grants.map(g => {
    const total = Number(g.totalAmount);
    const spent = Number(g.spentToDate);
    return {
      id: g.id,
      funderName: g.funderName,
      totalAmount: total,
      spentToDate: spent,
      startDate: g.startDate.toISOString(),
      endDate: g.endDate.toISOString(),
      percentSpent: total > 0 ? Math.round((spent / total) * 100) : 0,
    };
  });

  // 8. Compliance calendar
  const compliance = await db.complianceCalendar.findMany({ where: { orgId }, orderBy: { dueDate: 'asc' } });
  const pendingCount = compliance.filter(c => c.status === 'PENDING').length;
  const inProgressCount = compliance.filter(c => c.status === 'IN_PROGRESS').length;
  const filedCount = compliance.filter(c => c.status === 'FILED').length;

  // 9. Volunteer Event Impact
  const volunteersCount = await db.volunteer.count({ where: { orgId } });
  const volunteerEventsAgg = await db.volunteerEvent.aggregate({
    where: { orgId },
    _sum: { hours: true },
    _count: { _all: true },
  });
  const registrationsCount = await db.eventRegistration.count({ where: { orgId } });

  // 10. Open Risks & Alerts
  const alerts = await db.alert.findMany({
    where: { scopeType: 'ORG', scopeId: orgId, status: { in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] } },
    orderBy: { createdAt: 'desc' },
  });

  // 11. Recommended Board Actions (Handoffs)
  const handoffs = await db.agentHandoff.findMany({
    where: { orgId, status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
  });

  // 12. AI Narrative Drafts
  let aiNarrativeContent: string | null = null;
  let aiNarrativeStatus: 'ENABLED_DRAFT' | 'DISABLED' | 'NO_INSIGHTS' = 'DISABLED';

  if (options.includeAiNarrative) {
    const proposals = await db.conciergeProposal.findMany({
      where: { orgId, type: 'BOARD_BRIEF', status: { in: ['PENDING_REVIEW', 'APPROVED'] } },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    if (proposals.length > 0) {
      const p = proposals[0];
      const payload = p.payload as any;
      const rawText = payload?.brief || payload?.text || JSON.stringify(payload);
      aiNarrativeContent = `[AI GENERATED BRIEFING DRAFT - FOR HUMAN REVIEW ONLY]\nConfidence: ${Math.round(
        p.confidence * 100
      )}%\n\n${rawText}`;
      aiNarrativeStatus = 'ENABLED_DRAFT';
    } else {
      aiNarrativeStatus = 'NO_INSIGHTS';
    }
  }

  return {
    orgId,
    asOfIso: now.toISOString(),
    executiveSummary: {
      title: `Board Packet — ${orgName}`,
      generatedAt: now.toLocaleString(),
      description: `Deterministic rollup briefing of all operations and financials for the board of Directors.`,
    },
    financialSummary: {
      activeSentinelAlertsCount,
      financialReportStatus: activeSentinelAlertsCount > 0 ? 'ATTENTION_REQUIRED' : 'STABLE',
      netChange,
    },
    fundBalanceSummary: fundBalanceReport,
    campaignPerformance,
    donorActivity: {
      totalDonorsCount: donorsCount,
      totalDonationsCount: donations.length,
      totalDonationsAmount,
      averageDonationAmount,
    },
    grantMilestones,
    complianceObligations: {
      totalDeadlinesCount: compliance.length,
      pendingCount,
      inProgressCount,
      filedCount,
      deadlines: compliance.map(c => ({
        id: c.id,
        deadlineType: c.deadlineType,
        dueDateIso: c.dueDate.toISOString(),
        status: c.status,
      })),
    },
    volunteerEventImpact: {
      totalVolunteersCount: volunteersCount,
      totalHoursLogged: volunteerEventsAgg._sum.hours ? Number(volunteerEventsAgg._sum.hours) : 0,
      totalEventsCount: volunteerEventsAgg._count._all,
      totalRegistrationsCount: registrationsCount,
    },
    openRisksAndAlerts: alerts.map(a => ({
      id: a.id,
      severity: a.severity,
      title: a.title,
      body: a.body,
      createdAtIso: a.createdAt.toISOString(),
    })),
    recommendedBoardActions: handoffs.map(h => ({
      id: h.id,
      fromAgentName: h.fromAgentName,
      title: h.title,
      body: h.body,
      requiresHumanReview: h.requiresHumanReview,
    })),
    appendixAuditReferences: {
      details: 'Audit logs, ledger transaction identifiers, and evidence reference indexing.',
      sourceReferences: [
        ...alerts.map(a => `alert:${a.id}`),
        ...handoffs.map(h => `handoff:${h.id}`),
        ...campaigns.map(c => `campaign:${c.id}`),
        ...grants.map(g => `grant:${g.id}`),
      ],
    },
    aiNarrative: {
      content: aiNarrativeContent,
      status: aiNarrativeStatus,
    },
  };
}
