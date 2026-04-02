import type { AlertEvent } from '../../contracts/events';
import type { AgentRunContext } from '../../contracts/run';

export type ComplianceCalendarItem = {
  id: string;
  dueDate: Date;
  status: 'PENDING' | 'IN_PROGRESS' | 'FILED';
  deadlineType: 'FORM_990' | 'STATE_REGISTRATION' | 'GRANT_REPORT';
};

export type OrgInput = {
  id: string;
  ein: string;
  name: string;
  annualRevenue: number | null;
  subscriptionTier: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  // If true, org is using 990 postcard (Form 990-N) flow.
  uses990Postcard: boolean;
  fiscalYearEnd: Date | null;
};

export type GrantReportingDeadline = { grantId: string; dueDate: Date; title: string };

export type ComplianceWatchdogInputs = {
  ctx: AgentRunContext;
  org: OrgInput;
  complianceCalendar: ComplianceCalendarItem[];
  grantReportDeadlines: GrantReportingDeadline[];
  // Optional donor by state totals.
  donorsByState?: Record<string, number>;
};

export type ComplianceWatchdogRuleResult = {
  alerts: AlertEvent[];
  skippedRules: string[];
};

export function complianceDedupeKey(params: {
  agentName: string;
  scopeType: string;
  scopeId: string;
  alertType: string;
  windowEnd: Date;
}): string {
  return `${params.agentName}:${params.scopeType}:${params.scopeId}:${params.alertType}:${params.windowEnd.toISOString()}`;
}

export function runComplianceWatchdogRules(inputs: ComplianceWatchdogInputs): ComplianceWatchdogRuleResult {
  const { ctx, org } = inputs;
  const alerts: AlertEvent[] = [];
  const skippedRules: string[] = [];

  const operatorActions = [
    {
      label: 'Review active obligations (derived operator view)',
      kind: 'navigate',
      url: '/api/org/autonomous-ops/obligations/active',
      sourceRefs: [{ type: 'dest', href: '/api/org/autonomous-ops/obligations/active', status: 'IMPLEMENTED' }],
    },
    {
      label: 'Review executive operator board',
      kind: 'navigate',
      url: '/app/autonomous-ops/executive',
      sourceRefs: [{ type: 'dest', href: '/app/autonomous-ops/executive', status: 'UNIMPLEMENTED_IN_REPO' }],
    },
  ];

  // Rule 1: Filing threshold alert
  if (org.annualRevenue !== null && org.annualRevenue >= 50_000 && org.uses990Postcard) {
    alerts.push({
      agentName: ctx.agentName,
      scopeType: ctx.scope.type,
      scopeId: org.id,
      severity: 'HIGH',
      type: 'FORM_990_THRESHOLD_CROSSED',
      title: 'Form 990 filing threshold crossed',
      body: `Annual revenue is ${org.annualRevenue.toFixed(2)} which exceeds $50,000. Organization is marked as using 990 postcard flow.`,
      recommendedActions: [
        ...operatorActions,
        'Review filing type eligibility for current tax year.',
        'Prepare Form 990/990-EZ as required.',
      ],
      dedupeKey: complianceDedupeKey({
        agentName: ctx.agentName,
        scopeType: ctx.scope.type,
        scopeId: org.id,
        alertType: 'FORM_990_THRESHOLD_CROSSED',
        windowEnd: ctx.window.end,
      }),
    });
  }

  // Rule 2 + 3: ComplianceCalendar deadlines
  const now = ctx.window.end;
  const in30Days = new Date(now.getTime() + 30 * 86400000);
  for (const item of inputs.complianceCalendar) {
    if (item.status === 'FILED') continue;
    const due = item.dueDate;
    if (due.getTime() < now.getTime()) {
      alerts.push({
        agentName: ctx.agentName,
        scopeType: ctx.scope.type,
        scopeId: org.id,
        severity: 'HIGH',
        type: 'COMPLIANCE_DEADLINE_OVERDUE',
        title: 'Compliance deadline overdue',
        body: `${item.deadlineType} deadline was due on ${due.toISOString().slice(0, 10)} and is not filed.`,
        recommendedActions: [
          ...operatorActions,
          'File immediately or update status to FILED if already completed.',
        ],
        dedupeKey: complianceDedupeKey({
          agentName: ctx.agentName,
          scopeType: ctx.scope.type,
          scopeId: org.id,
          alertType: `COMPLIANCE_DEADLINE_OVERDUE:${item.id}`,
          windowEnd: ctx.window.end,
        }),
      });
    } else if (due.getTime() <= in30Days.getTime()) {
      alerts.push({
        agentName: ctx.agentName,
        scopeType: ctx.scope.type,
        scopeId: org.id,
        severity: 'MED',
        type: 'COMPLIANCE_DEADLINE_UPCOMING',
        title: 'Compliance deadline upcoming',
        body: `${item.deadlineType} deadline is due on ${due.toISOString().slice(0, 10)} and is not filed.`,
        recommendedActions: [
          ...operatorActions,
          'Start preparation and ensure tasks are assigned.',
        ],
        dedupeKey: complianceDedupeKey({
          agentName: ctx.agentName,
          scopeType: ctx.scope.type,
          scopeId: org.id,
          alertType: `COMPLIANCE_DEADLINE_UPCOMING:${item.id}`,
          windowEnd: ctx.window.end,
        }),
      });
    }
  }

  // Rule 4: Grant report deadlines — overdue and within 30 days
  for (const d of inputs.grantReportDeadlines) {
    if (d.dueDate.getTime() < now.getTime()) {
      alerts.push({
        agentName: ctx.agentName,
        scopeType: ctx.scope.type,
        scopeId: org.id,
        severity: 'HIGH',
        type: 'GRANT_REPORT_DEADLINE_OVERDUE',
        title: 'Grant report deadline overdue',
        body: `Grant report "${d.title}" was due on ${d.dueDate.toISOString().slice(0, 10)} (verify status with finance).`,
        recommendedActions: [
          ...operatorActions,
          'Confirm submission status and update grant records if already filed.',
        ],
        dedupeKey: complianceDedupeKey({
          agentName: ctx.agentName,
          scopeType: ctx.scope.type,
          scopeId: org.id,
          alertType: `GRANT_REPORT_DEADLINE_OVERDUE:${d.grantId}:${d.dueDate.toISOString().slice(0, 10)}`,
          windowEnd: ctx.window.end,
        }),
      });
    } else if (d.dueDate.getTime() <= in30Days.getTime()) {
      alerts.push({
        agentName: ctx.agentName,
        scopeType: ctx.scope.type,
        scopeId: org.id,
        severity: 'MED',
        type: 'GRANT_REPORT_DEADLINE_UPCOMING',
        title: 'Grant report deadline upcoming',
        body: `Grant report "${d.title}" is due on ${d.dueDate.toISOString().slice(0, 10)}.`,
        recommendedActions: [
          ...operatorActions,
          'Confirm reporting requirements and start drafting report.',
        ],
        dedupeKey: complianceDedupeKey({
          agentName: ctx.agentName,
          scopeType: ctx.scope.type,
          scopeId: org.id,
          alertType: `GRANT_REPORT_DEADLINE_UPCOMING:${d.grantId}:${d.dueDate.toISOString().slice(0, 10)}`,
          windowEnd: ctx.window.end,
        }),
      });
    }
  }

  // Rule 5: State registration heuristic (optional)
  if (!inputs.donorsByState) {
    skippedRules.push('STATE_REGISTRATION_HEURISTIC_NO_DONOR_TOTALS');
  } else {
    // Static thresholds by state: donors count.
    const thresholds: Record<string, number> = {
      CA: 50,
      NY: 25,
      TX: 50,
      FL: 40,
    };
    const exceeded = Object.entries(inputs.donorsByState).filter(([state, count]) => {
      const t = thresholds[state];
      return typeof t === 'number' && count >= t;
    });
    for (const [state, count] of exceeded) {
      alerts.push({
        agentName: ctx.agentName,
        scopeType: ctx.scope.type,
        scopeId: org.id,
        severity: 'HIGH',
        type: 'STATE_REGISTRATION_POSSIBLY_REQUIRED',
        title: 'Possible state registration requirement',
        body: `Donor count in ${state} is ${count} which exceeds threshold. No registration record was detected in ComplianceCalendar.`,
        recommendedActions: [
          `Verify whether charitable solicitation registration is required in ${state}.`,
          'If required, add a ComplianceCalendar item and complete registration.',
        ],
        dedupeKey: complianceDedupeKey({
          agentName: ctx.agentName,
          scopeType: ctx.scope.type,
          scopeId: org.id,
          alertType: `STATE_REGISTRATION_POSSIBLY_REQUIRED:${state}`,
          windowEnd: ctx.window.end,
        }),
      });
    }
  }

  return { alerts, skippedRules };
}

