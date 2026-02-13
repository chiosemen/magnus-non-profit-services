import type { AlertEvent } from '../../contracts/events';
import type { AgentRunContext } from '../../contracts/run';

export type GrantInput = {
  id: string;
  orgId: string;
  funderName: string;
  totalAmount: number;
  spentToDate: number;
  startDate: Date;
  endDate: Date;
  reportingSchedule: unknown;
};

export type GrantReportCalendarItem = {
  id: string;
  dueDate: Date;
  status: 'PENDING' | 'IN_PROGRESS' | 'FILED';
};

export function grantDedupeKey(params: {
  agentName: string;
  scopeType: string;
  scopeId: string;
  alertType: string;
  windowEnd: Date;
}): string {
  return `${params.agentName}:${params.scopeType}:${params.scopeId}:${params.alertType}:${params.windowEnd.toISOString()}`;
}

export type GrantLifecycleInputs = {
  ctx: AgentRunContext;
  grant: GrantInput;
  workerIds: string[];
  complianceGrantReportCalendar?: GrantReportCalendarItem[];
};

export function runGrantLifecycleRules(inputs: GrantLifecycleInputs): { alerts: AlertEvent[]; metrics: Record<string, unknown> } {
  const alerts: AlertEvent[] = [];
  const { ctx, grant } = inputs;

  const now = ctx.window.end;
  const today = startOfLocalDay(now);
  const grantEndDay = startOfLocalDay(grant.endDate);
  const in30 = new Date(now.getTime() + 30 * 86400000);

  const timeRemainingDays = Math.round((grantEndDay.getTime() - today.getTime()) / 86400000);

  // Rule 1: Renewal planning (org alert) - exact boundary (180 days).
  if (timeRemainingDays === 180) {
    alerts.push({
      agentName: ctx.agentName,
      scopeType: 'org',
      scopeId: grant.orgId,
      severity: 'MED',
      type: 'GRANT_RENEWAL_PLANNING',
      title: 'Grant renewal planning checkpoint',
      body: `Grant ends on ${grant.endDate.toISOString().slice(0, 10)}. Start renewal planning at 180 days out.`,
      recommendedActions: [
        'Review grant outcomes and renewal eligibility.',
        'Confirm funder renewal timeline and required documents.',
      ],
      dedupeKey: grantDedupeKey({
        agentName: ctx.agentName,
        scopeType: 'org',
        scopeId: grant.orgId,
        alertType: `GRANT_RENEWAL_PLANNING:${grant.id}`,
        windowEnd: ctx.window.end,
      }),
    });
  }

  // Rule 2: Worker runway (worker alert fan-out) - exact boundary (270 days).
  if (timeRemainingDays === 270) {
    for (const workerId of inputs.workerIds) {
      alerts.push({
        agentName: ctx.agentName,
        scopeType: 'worker',
        scopeId: workerId,
        severity: 'MED',
        type: 'POSITION_ENDING_SOON',
        title: 'Grant-funded position runway checkpoint',
        body: `A grant funding this position ends on ${grant.endDate.toISOString().slice(0, 10)} (270-day checkpoint).`,
        recommendedActions: ['Coordinate with org leadership on renewal and contingency plans.'],
        dedupeKey: grantDedupeKey({
          agentName: ctx.agentName,
          scopeType: 'worker',
          scopeId: workerId,
          alertType: `POSITION_ENDING_SOON:270D:${grant.id}`,
          windowEnd: ctx.window.end,
        }),
      });
    }
  }

  // Rule 3: Underspending opportunity (org alert).
  const spendingPace = grant.totalAmount > 0 ? grant.spentToDate / grant.totalAmount : 0;
  const durationMs = grant.endDate.getTime() - grant.startDate.getTime();
  const elapsedMsRaw = now.getTime() - grant.startDate.getTime();
  const elapsedMs = Math.max(0, Math.min(durationMs, elapsedMsRaw));
  const timePace = durationMs > 0 ? elapsedMs / durationMs : 0;

  if (durationMs > 0 && grant.totalAmount > 0 && spendingPace < timePace * 0.8) {
    alerts.push({
      agentName: ctx.agentName,
      scopeType: 'org',
      scopeId: grant.orgId,
      severity: 'MED',
      type: 'GRANT_UNDERSPEND_OPPORTUNITY',
      title: 'Grant underspend opportunity',
      body: `Spending pace (${(spendingPace * 100).toFixed(1)}%) is behind time pace (${(timePace * 100).toFixed(1)}%).`,
      recommendedActions: ['Review budget allocations and accelerate planned program spend where appropriate.'],
      dedupeKey: grantDedupeKey({
        agentName: ctx.agentName,
        scopeType: 'org',
        scopeId: grant.orgId,
        alertType: `GRANT_UNDERSPEND_OPPORTUNITY:${grant.id}`,
        windowEnd: ctx.window.end,
      }),
    });
  }

  // Rule 4: Report deadlines (reportingSchedule within 30 days => org alert).
  const deadlines = extractDeadlines(grant.reportingSchedule);
  for (const d of deadlines) {
    if (d.dueDate.getTime() >= now.getTime() && d.dueDate.getTime() <= in30.getTime()) {
      alerts.push({
        agentName: ctx.agentName,
        scopeType: 'org',
        scopeId: grant.orgId,
        severity: 'MED',
        type: 'GRANT_REPORT_DEADLINE_UPCOMING',
        title: 'Grant report deadline upcoming',
        body: `Report "${d.title}" due on ${d.dueDate.toISOString().slice(0, 10)}.`,
        recommendedActions: ['Assign owner and begin report preparation.'],
        dedupeKey: grantDedupeKey({
          agentName: ctx.agentName,
          scopeType: 'org',
          scopeId: grant.orgId,
          alertType: `GRANT_REPORT_DEADLINE_UPCOMING:reportingSchedule:${grant.id}:${d.dueDate.toISOString().slice(0, 10)}`,
          windowEnd: ctx.window.end,
        }),
      });
    }
  }

  // Optional: ComplianceCalendar GRANT_REPORT items (within 30 days).
  for (const item of inputs.complianceGrantReportCalendar ?? []) {
    if (item.status === 'FILED') continue;
    if (item.dueDate.getTime() >= now.getTime() && item.dueDate.getTime() <= in30.getTime()) {
      alerts.push({
        agentName: ctx.agentName,
        scopeType: 'org',
        scopeId: grant.orgId,
        severity: 'MED',
        type: 'GRANT_REPORT_DEADLINE_UPCOMING',
        title: 'Grant report deadline upcoming',
        body: `Compliance calendar grant report deadline due on ${item.dueDate.toISOString().slice(0, 10)}.`,
        recommendedActions: ['Confirm submission requirements and update status after filing.'],
        dedupeKey: grantDedupeKey({
          agentName: ctx.agentName,
          scopeType: 'org',
          scopeId: grant.orgId,
          alertType: `GRANT_REPORT_DEADLINE_UPCOMING:complianceCalendar:${item.id}`,
          windowEnd: ctx.window.end,
        }),
      });
    }
  }

  // Rule 5: Grant end imminent (org HIGH + worker HIGH within 30 days).
  if (timeRemainingDays >= 0 && timeRemainingDays <= 30) {
    alerts.push({
      agentName: ctx.agentName,
      scopeType: 'org',
      scopeId: grant.orgId,
      severity: 'HIGH',
      type: 'GRANT_END_IMMINENT',
      title: 'Grant end imminent',
      body: `Grant ends in ${timeRemainingDays} day(s) on ${grant.endDate.toISOString().slice(0, 10)}.`,
      recommendedActions: ['Complete closeout tasks and confirm reporting obligations.'],
      dedupeKey: grantDedupeKey({
        agentName: ctx.agentName,
        scopeType: 'org',
        scopeId: grant.orgId,
        alertType: `GRANT_END_IMMINENT:${grant.id}`,
        windowEnd: ctx.window.end,
      }),
    });

    for (const workerId of inputs.workerIds) {
      alerts.push({
        agentName: ctx.agentName,
        scopeType: 'worker',
        scopeId: workerId,
        severity: 'HIGH',
        type: 'POSITION_ENDING_SOON',
        title: 'Grant-funded position ending soon',
        body: `Grant funding may end in ${timeRemainingDays} day(s) on ${grant.endDate.toISOString().slice(0, 10)}.`,
        recommendedActions: ['Coordinate on renewal/transition plan and update personal runway planning.'],
        dedupeKey: grantDedupeKey({
          agentName: ctx.agentName,
          scopeType: 'worker',
          scopeId: workerId,
          alertType: `POSITION_ENDING_SOON:30D:${grant.id}`,
          windowEnd: ctx.window.end,
        }),
      });
    }
  }

  return {
    alerts,
    metrics: {
      grantId: grant.id,
      orgId: grant.orgId,
      timeRemainingDays,
      spendingPace,
      timePace,
      deadlinesCount: deadlines.length,
    },
  };
}

function extractDeadlines(reportingSchedule: unknown): Array<{ dueDate: Date; title: string }> {
  const rs = reportingSchedule;
  const list = Array.isArray(rs)
    ? rs
    : (rs && typeof rs === 'object' && Array.isArray((rs as any).deadlines))
      ? (rs as any).deadlines
      : [];
  const out: Array<{ dueDate: Date; title: string }> = [];
  for (const item of list) {
    const dueRaw = item?.dueDate ?? item?.due_date ?? item?.date;
    const titleRaw = item?.title ?? item?.name ?? 'Grant report';
    if (!dueRaw) continue;
    const d = new Date(String(dueRaw));
    if (Number.isNaN(d.getTime())) continue;
    out.push({ dueDate: d, title: String(titleRaw) });
  }
  return out;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
