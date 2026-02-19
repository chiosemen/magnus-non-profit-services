import type { AlertSink } from '../../sinks/AlertSink';
import type { AgentRunContext } from '../../contracts/run';
import { prisma } from '../../db';
import { runComplianceWatchdogRules } from './rules';

export class ComplianceWatchdog {
  private readonly sink: AlertSink;

  constructor(sink: AlertSink) {
    this.sink = sink;
  }

  async run(ctx: AgentRunContext): Promise<Record<string, unknown>> {
    const orgId = ctx.scope.id;

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        ein: true,
        name: true,
        annualRevenue: true,
        subscriptionTier: true,
        fiscalYearEnd: true,
      },
    });
    if (!org) {
      throw new Error('Organization not found');
    }

    const complianceCalendar = await prisma.complianceCalendar.findMany({
      where: { orgId: org.id },
      select: { id: true, dueDate: true, status: true, deadlineType: true },
    });

    const grants = await prisma.grant.findMany({
      where: { orgId: org.id },
      select: { id: true, reportingSchedule: true },
    });

    const grantReportDeadlines = extractGrantReportDeadlines(grants);

    // "Starter logic" for postcard assumption: STARTER tier uses postcard unless specified otherwise.
    // This is deterministic and can be refined once explicit org filing config exists.
    const uses990Postcard = org.subscriptionTier === 'STARTER';
    const annualRevenue = org.annualRevenue === null ? null : Number(org.annualRevenue);

    const result = runComplianceWatchdogRules({
      ctx,
      org: {
        id: org.id,
        ein: org.ein,
        name: org.name,
        annualRevenue,
        subscriptionTier: org.subscriptionTier,
        uses990Postcard,
        fiscalYearEnd: org.fiscalYearEnd,
      },
      complianceCalendar: complianceCalendar.map(i => ({
        id: i.id,
        dueDate: i.dueDate,
        status: i.status,
        deadlineType: i.deadlineType,
      })),
      grantReportDeadlines,
      // donorsByState intentionally omitted unless/ until such data exists in DB.
    });

    for (const alert of result.alerts) {
      await this.sink.emit(alert);
    }

    return {
      orgId: org.id,
      alertsEmitted: result.alerts.length,
      skippedRules: result.skippedRules,
    };
  }
}

function extractGrantReportDeadlines(grants: Array<{ id: string; reportingSchedule: unknown }>) {
  const out: Array<{ grantId: string; dueDate: Date; title: string }> = [];
  for (const g of grants) {
    const rs = g.reportingSchedule;
    // Supported shapes:
    // 1) [{ dueDate: "...", title: "..." }, ...]
    // 2) { deadlines: [{ dueDate, title }, ...] }
    const list = Array.isArray(rs)
      ? rs
      : (rs && typeof rs === 'object' && Array.isArray((rs as any).deadlines))
        ? (rs as any).deadlines
        : [];

    for (const item of list) {
      const dueRaw = item?.dueDate ?? item?.due_date ?? item?.date;
      const titleRaw = item?.title ?? item?.name ?? 'Grant report';
      if (!dueRaw) continue;
      const d = new Date(String(dueRaw));
      if (Number.isNaN(d.getTime())) continue;
      out.push({ grantId: g.id, dueDate: d, title: String(titleRaw) });
    }
  }
  return out;
}

