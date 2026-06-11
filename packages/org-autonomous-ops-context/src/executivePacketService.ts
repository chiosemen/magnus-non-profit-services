import { PrismaClient } from '@magnus/db/types';
import { buildFinancialSummary } from './financialSummary';

export interface ExecutivePacketDto {
  orgId: string;
  asOfIso: string;
  financialSummary: any;
  grantsSummary: {
    totalGrantsCount: number;
    totalGrantsAmount: number;
    totalSpentAmount: number;
    grantsList: Array<{
      id: string;
      funderName: string;
      totalAmount: number;
      spentToDate: number;
      startDateIso: string;
      endDateIso: string;
      percentSpent: number;
    }>;
  };
  complianceSummary: {
    totalDeadlinesCount: number;
    pendingCount: number;
    inProgressCount: number;
    filedCount: number;
    upcomingDeadlines: Array<{
      id: string;
      deadlineType: string;
      dueDateIso: string;
      status: string;
    }>;
  };
  volunteerSummary: {
    totalEventsCount: number;
    totalHoursLogged: number;
  };
  narrativeSummary: string;
}

export async function buildExecutivePacket(
  db: PrismaClient,
  orgId: string,
  now?: Date
): Promise<ExecutivePacketDto> {
  const currentDate = now ?? new Date();

  // 1. Fetch Financial Summary
  const financial = await buildFinancialSummary({ db, orgId, now: currentDate });

  // 2. Fetch Compliance deadlines
  const compliance = await db.complianceCalendar.findMany({
    where: { orgId },
    orderBy: { dueDate: 'asc' },
  });

  // 3. Fetch Volunteer metrics
  const volunteerEvents = await db.volunteerEvent.aggregate({
    where: { orgId },
    _count: { _all: true },
    _sum: { hours: true },
  });

  // 4. Summarize Grants
  const grantsList = financial.grants.map(g => {
    const total = g.totalAmount;
    const spent = g.spentToDate;
    const percentSpent = total > 0 ? Math.round((spent / total) * 100) : 0;
    return {
      ...g,
      percentSpent,
    };
  });

  const totalGrantsAmount = grantsList.reduce((acc, g) => acc + g.totalAmount, 0);
  const totalSpentAmount = grantsList.reduce((acc, g) => acc + g.spentToDate, 0);

  // 5. Summarize Compliance
  const pendingCount = compliance.filter(c => c.status === 'PENDING').length;
  const inProgressCount = compliance.filter(c => c.status === 'IN_PROGRESS').length;
  const filedCount = compliance.filter(c => c.status === 'FILED').length;

  // 6. Narrative Generation
  const alertsCount = financial.sentinelActiveAlerts.length;
  const alertSection =
    alertsCount > 0
      ? `There are currently ${alertsCount} active financial sentinel alerts requiring attention.`
      : 'Financial operations are stable with no active sentinel alerts.';

  const grantListStr = grantsList.map(g => `${g.funderName} ($${g.totalAmount.toLocaleString()} total, $${g.spentToDate.toLocaleString()} spent)`).join(', ');
  const grantSection =
    grantsList.length > 0
      ? `We are currently tracking ${grantsList.length} grant(s) totaling $${totalGrantsAmount.toLocaleString(
          undefined,
          { minimumFractionDigits: 2 }
        )}. Spent-to-date stands at $${totalSpentAmount.toLocaleString(undefined, {
          minimumFractionDigits: 2,
        })} (${
          totalGrantsAmount > 0 ? Math.round((totalSpentAmount / totalGrantsAmount) * 100) : 0
        }% spent). Active grants: ${grantListStr}.`
      : 'No active grants are recorded at this time.';

  const complianceSection = `Compliance tracking shows ${compliance.length} deadline(s) registered: ${filedCount} filed, ${inProgressCount} in progress, and ${pendingCount} pending review.`;

  const volunteerSection = `A total of ${
    volunteerEvents._sum.hours ? Number(volunteerEvents._sum.hours) : 0
  } volunteer hours have been logged across ${volunteerEvents._count._all} events.`;

  const narrativeSummary = [
    `Executive Narrative Briefing — As of ${currentDate.toLocaleDateString()}`,
    alertSection,
    grantSection,
    complianceSection,
    volunteerSection,
  ].join('\n\n');

  return {
    orgId,
    asOfIso: currentDate.toISOString(),
    financialSummary: financial,
    grantsSummary: {
      totalGrantsCount: grantsList.length,
      totalGrantsAmount,
      totalSpentAmount,
      grantsList,
    },
    complianceSummary: {
      totalDeadlinesCount: compliance.length,
      pendingCount,
      inProgressCount,
      filedCount,
      upcomingDeadlines: compliance.map(c => ({
        id: c.id,
        deadlineType: c.deadlineType,
        dueDateIso: c.dueDate.toISOString(),
        status: c.status,
      })),
    },
    volunteerSummary: {
      totalEventsCount: volunteerEvents._count._all,
      totalHoursLogged: volunteerEvents._sum.hours ? Number(volunteerEvents._sum.hours) : 0,
    },
    narrativeSummary,
  };
}
