import type { AlertStatus, OrgContextFileKind, PrismaClient } from '@magnus/db/types';
import type { Destination, ExecutiveModuleKey, ModuleStateCode, Severity } from './executiveSemantics';
import { isKnownSeverity, moduleStateRank, severityRank } from './executiveSemantics';
import { AutonomousOpsSettingsService } from './autonomySettingsService';
import { buildActiveObligations, type ActiveObligation } from './activeObligations';
import { buildFinancialSummary, type FinancialSummary } from './financialSummary';
import { deriveDonorOpsModuleState } from './donorOpsModule';
import { deriveVolunteerOpsModuleState } from './volunteerOpsModule';
import {
  EXECUTIVE_BOARD_COMPLIANCE_DUE_SOON_DAYS,
  isComplianceDueSoonNotFiled,
  isComplianceOverdueNotFiled,
} from './portfolioAccountability';

export type EvidenceRef = {
  sourceModule: ExecutiveModuleKey;
  refType:
    | 'alert'
    | 'handoff'
    | 'compliance_calendar'
    | 'grant'
    | 'context_file'
    | 'settings'
    | 'donor_event'
    | 'volunteer_event';
  refId: string;
  label: string;
  destination: Destination;
};

export type ModuleStateRow = {
  module: ExecutiveModuleKey;
  state: ModuleStateCode;
  severity: Severity | null;
  summary: string;
  counts?: Record<string, number>;
  destination: Destination;
  evidenceRefs: EvidenceRef[];
};

export type TopItem =
  | {
      kind: 'alert';
      severity: Severity;
      createdAtIso: string;
      title: string;
      type: string;
      alertId: string;
      destination: Destination;
      evidenceRefs: EvidenceRef[];
    }
  | {
      kind: 'handoff';
      severity: Severity;
      createdAtIso: string;
      title: string;
      fromAgentName: string;
      handoffId: string;
      destination: Destination;
      evidenceRefs: EvidenceRef[];
    }
  | {
      kind: 'compliance_calendar';
      severity: Severity;
      dueDateIso: string;
      deadlineType: string;
      status: string;
      calendarId: string;
      destination: Destination;
      evidenceRefs: EvidenceRef[];
    };

export type ExecutiveBoard = {
  orgId: string;
  asOfIso: string;
  moduleStates: ModuleStateRow[];
  topItems: TopItem[];
  activeObligations: ActiveObligation[];
  financialSummary: FinancialSummary;
  evidenceIndex: EvidenceRef[];
  disclaimers: string[];
};

function uiDest(href: string): Destination {
  // Truthful flag: UI destinations are not implemented in this repo.
  return { href, status: 'UNIMPLEMENTED_IN_REPO' };
}

function maxSeverity(values: Severity[]): Severity {
  if (values.includes('CRITICAL')) return 'CRITICAL';
  if (values.includes('HIGH')) return 'HIGH';
  if (values.includes('MED')) return 'MED';
  return 'LOW';
}

function alertStatusCounts(alerts: Array<{ status: AlertStatus }>): Record<string, number> {
  const out: Record<string, number> = { OPEN: 0, ACKNOWLEDGED: 0, IN_PROGRESS: 0, RESOLVED: 0, CANCELLED: 0 };
  for (const a of alerts) out[a.status] = (out[a.status] ?? 0) + 1;
  return out;
}

function deriveModuleSeverity(params: { state: ModuleStateCode; evidenceSeverities: Severity[] }): Severity | null {
  if (params.state === 'OK' || params.state === 'NOT_APPLICABLE') {
    return params.evidenceSeverities.length > 0 ? maxSeverity(params.evidenceSeverities) : null;
  }
  // For configuration/data availability states, use MED as a default attention level.
  if (params.state === 'NOT_CONFIGURED') return 'MED';
  if (params.state === 'INSUFFICIENT_DATA') return 'MED';
  if (params.state === 'UNAVAILABLE') return 'HIGH';
  return null;
}

export async function buildExecutiveBoard(params: {
  db: PrismaClient;
  orgId: string;
  take?: number;
  now?: Date;
}): Promise<ExecutiveBoard> {
  const now = params.now ?? new Date();
  const take = params.take ?? 50;

  const settingsSvc = new AutonomousOpsSettingsService(params.db);

  const [
    settings,
    complianceCalendar,
    grants,
    alerts,
    handoffs,
    contextFiles,
    activeObligations,
    financialSummary,
    orgStripe,
    donorAgg,
    donorEvidenceRows,
    volunteerAgg,
    volunteerEvidenceRows,
  ] = await Promise.all([
    settingsSvc.get(params.orgId),
    params.db.complianceCalendar.findMany({
      where: { orgId: params.orgId },
      select: { id: true, dueDate: true, status: true, deadlineType: true },
      orderBy: { dueDate: 'asc' },
    }),
    params.db.grant.findMany({
      where: { orgId: params.orgId },
      select: { id: true, funderName: true, endDate: true },
      orderBy: { endDate: 'desc' },
    }),
    params.db.alert.findMany({
      where: { scopeType: 'ORG', scopeId: params.orgId },
      select: { id: true, type: true, title: true, severity: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take,
    }),
    params.db.agentHandoff.findMany({
      where: { orgId: params.orgId, status: 'OPEN' },
      select: { id: true, title: true, fromAgentName: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take,
    }),
    params.db.orgContextFile.findMany({
      where: { orgId: params.orgId },
      select: { id: true, kind: true, updatedAt: true },
    }),
    buildActiveObligations({ db: params.db, orgId: params.orgId, take, now }),
    buildFinancialSummary({ db: params.db, orgId: params.orgId, takeAlerts: take, takeGrants: 200, now }),
    params.db.organization.findUnique({
      where: { id: params.orgId },
      select: { stripeAccountId: true },
    }),
    params.db.donorEvent.aggregate({
      where: { orgId: params.orgId },
      _count: { _all: true },
      _min: { occurredAt: true },
      _max: { occurredAt: true },
    }),
    params.db.donorEvent.findMany({
      where: { orgId: params.orgId },
      orderBy: { occurredAt: 'desc' },
      take: 5,
      select: { id: true, occurredAt: true, amount: true, currency: true, sourceSystem: true },
    }),
    params.db.volunteerEvent.aggregate({
      where: { orgId: params.orgId },
      _count: { _all: true },
      _min: { occurredAt: true },
      _max: { occurredAt: true },
      _sum: { hours: true },
    }),
    params.db.volunteerEvent.findMany({
      where: { orgId: params.orgId },
      orderBy: { occurredAt: 'desc' },
      take: 5,
      select: { id: true, occurredAt: true, hours: true, sourceSystem: true, activityLabel: true },
    }),
  ]);

  const evidenceIndex: EvidenceRef[] = [];

  const expectedKinds: OrgContextFileKind[] = ['ORG_IDENTITY', 'ORG_SOUL', 'ORG_AGENTS', 'ORG_MEMORY', 'ORG_HEARTBEAT'];
  const presentKinds = new Set(contextFiles.map(f => f.kind));
  const missingKinds = expectedKinds.filter(k => !presentKinds.has(k));

  // Destinations (UI-style; explicitly unimplemented in repo)
  const destSettings = uiDest('/app/autonomous-ops/settings');
  const destContext = uiDest('/app/autonomous-ops/identity-files');
  const destCompliance = uiDest('/app/compliance');
  const destGrants = uiDest('/app/grants');
  const destAlerts = uiDest('/app/autonomous-ops/alerts');
  const destHandoffs = uiDest('/app/autonomous-ops/handoffs');
  const destDonorOps = uiDest('/app/autonomous-ops/donor-events');
  const destVolunteerOps = uiDest('/app/autonomous-ops/volunteer-ops');

  const volunteerEventCount = volunteerAgg._count._all ?? 0;
  const volunteerHoursSum = volunteerAgg._sum.hours;
  const volunteerTotalHours =
    volunteerHoursSum === null || volunteerHoursSum === undefined ? 0 : Number(volunteerHoursSum);

  const volunteerDerived = deriveVolunteerOpsModuleState({
    eventCount: volunteerEventCount,
    totalHours: volunteerTotalHours,
    oldestOccurredAt: volunteerAgg._min.occurredAt,
    newestOccurredAt: volunteerAgg._max.occurredAt,
    now,
  });

  const donorEventCount = donorAgg._count._all ?? 0;
  const donorDerived = deriveDonorOpsModuleState({
    stripeAccountId: orgStripe?.stripeAccountId,
    eventCount: donorEventCount,
    oldestOccurredAt: donorAgg._min.occurredAt,
    newestOccurredAt: donorAgg._max.occurredAt,
    now,
  });

  const settingsEnabledAgents = Array.isArray((settings as any).enabledAgents) ? (settings as any).enabledAgents : settings.enabledAgents;
  const settingsConfigured =
    Boolean((settings as any).enabled) === false
      ? false
      : Array.isArray(settingsEnabledAgents)
        ? settingsEnabledAgents.length > 0
        : Array.isArray(settings.enabledAgents) && settings.enabledAgents.length > 0;

  const settingsState: ModuleStateCode = settingsConfigured ? 'OK' : 'NOT_CONFIGURED';

  const contextState: ModuleStateCode = missingKinds.length === 0 ? 'OK' : 'INSUFFICIENT_DATA';

  const grantsState: ModuleStateCode = grants.length === 0 ? 'NOT_APPLICABLE' : 'OK';

  const complianceDueSoon = complianceCalendar.filter(c =>
    isComplianceDueSoonNotFiled(c, now, EXECUTIVE_BOARD_COMPLIANCE_DUE_SOON_DAYS),
  );
  const complianceOverdue = complianceCalendar.filter(c => isComplianceOverdueNotFiled(c, now));

  const alertSeverities: Severity[] = [];
  for (const a of alerts) {
    if (!isKnownSeverity(a.severity)) {
      // Fail closed: we only support known severities for executive ordering semantics.
      throw new Error('UNKNOWN_ALERT_SEVERITY');
    }
    alertSeverities.push(a.severity);
    evidenceIndex.push({
      sourceModule: 'alerts',
      refType: 'alert',
      refId: a.id,
      label: `${a.type}: ${a.title}`,
      destination: uiDest(`/app/autonomous-ops/alerts/${a.id}`),
    });
  }
  for (const h of handoffs) {
    evidenceIndex.push({
      sourceModule: 'handoffs',
      refType: 'handoff',
      refId: h.id,
      label: `${h.fromAgentName}: ${h.title}`,
      destination: uiDest(`/app/autonomous-ops/handoffs/${h.id}`),
    });
  }
  for (const c of complianceCalendar) {
    evidenceIndex.push({
      sourceModule: 'compliance_calendar',
      refType: 'compliance_calendar',
      refId: c.id,
      label: `${c.deadlineType} due ${c.dueDate.toISOString().slice(0, 10)} (${c.status})`,
      destination: uiDest(`/app/compliance/${c.id}`),
    });
  }
  for (const g of grants) {
    evidenceIndex.push({
      sourceModule: 'grants',
      refType: 'grant',
      refId: g.id,
      label: `${g.funderName} ends ${g.endDate.toISOString().slice(0, 10)}`,
      destination: uiDest(`/app/grants/${g.id}`),
    });
  }
  for (const f of contextFiles) {
    evidenceIndex.push({
      sourceModule: 'org_context',
      refType: 'context_file',
      refId: f.id,
      label: `${f.kind} updated ${f.updatedAt.toISOString().slice(0, 10)}`,
      destination: uiDest(`/app/autonomous-ops/identity-files/${f.kind}`),
    });
  }
  evidenceIndex.push({
    sourceModule: 'autonomous_ops_settings',
    refType: 'settings',
    refId: (settings as any).id ?? params.orgId,
    label: 'Autonomous Ops settings',
    destination: destSettings,
  });
  for (const d of donorEvidenceRows) {
    evidenceIndex.push({
      sourceModule: 'donor_ops',
      refType: 'donor_event',
      refId: d.id,
      label: `${d.sourceSystem} ${d.amount.toString()} ${d.currency} @ ${d.occurredAt.toISOString().slice(0, 10)}`,
      destination: destDonorOps,
    });
  }
  for (const v of volunteerEvidenceRows) {
    const act = v.activityLabel ? ` — ${v.activityLabel.slice(0, 80)}` : '';
    evidenceIndex.push({
      sourceModule: 'volunteer_ops',
      refType: 'volunteer_event',
      refId: v.id,
      label: `${v.sourceSystem} ${v.hours.toString()}h @ ${v.occurredAt.toISOString().slice(0, 10)}${act}`,
      destination: destVolunteerOps,
    });
  }

  const moduleStates: ModuleStateRow[] = [
    {
      module: 'autonomous_ops_settings',
      state: settingsState,
      severity: deriveModuleSeverity({ state: settingsState, evidenceSeverities: [] }),
      summary: settingsState === 'OK' ? 'Autonomous Ops settings are configured.' : 'Autonomous Ops settings are not configured.',
      destination: destSettings,
      evidenceRefs: evidenceIndex.filter(e => e.sourceModule === 'autonomous_ops_settings'),
    },
    {
      module: 'org_context',
      state: contextState,
      severity: deriveModuleSeverity({ state: contextState, evidenceSeverities: [] }),
      summary: contextState === 'OK' ? 'Org context files are present.' : `Missing org context kinds: ${missingKinds.join(', ')}`,
      counts: { present: contextFiles.length, missingKinds: missingKinds.length },
      destination: destContext,
      evidenceRefs: evidenceIndex.filter(e => e.sourceModule === 'org_context'),
    },
    {
      module: 'compliance_calendar',
      state: 'OK',
      severity: complianceOverdue.length > 0 ? 'HIGH' : complianceDueSoon.length > 0 ? 'MED' : null,
      summary: `Compliance calendar rows: ${complianceCalendar.length}. Overdue: ${complianceOverdue.length}. Due soon (~30d): ${complianceDueSoon.length}.`,
      counts: { total: complianceCalendar.length, overdue: complianceOverdue.length, dueSoon: complianceDueSoon.length },
      destination: destCompliance,
      evidenceRefs: evidenceIndex.filter(e => e.sourceModule === 'compliance_calendar'),
    },
    {
      module: 'grants',
      state: grantsState,
      severity: deriveModuleSeverity({ state: grantsState, evidenceSeverities: [] }),
      summary: grantsState === 'NOT_APPLICABLE' ? 'No grants recorded.' : `Grants recorded: ${grants.length}.`,
      counts: { total: grants.length },
      destination: destGrants,
      evidenceRefs: evidenceIndex.filter(e => e.sourceModule === 'grants'),
    },
    {
      module: 'alerts',
      state: 'OK',
      severity: alertSeverities.length > 0 ? maxSeverity(alertSeverities) : null,
      summary: `Recent alerts (capped): ${alerts.length}.`,
      counts: { total: alerts.length, ...alertStatusCounts(alerts) },
      destination: destAlerts,
      evidenceRefs: evidenceIndex.filter(e => e.sourceModule === 'alerts'),
    },
    {
      module: 'handoffs',
      state: 'OK',
      severity: handoffs.length > 0 ? 'MED' : null,
      summary: `Open handoffs: ${handoffs.length}.`,
      counts: { open: handoffs.length },
      destination: destHandoffs,
      evidenceRefs: evidenceIndex.filter(e => e.sourceModule === 'handoffs'),
    },
    {
      module: 'donor_ops',
      state: donorDerived.state,
      severity: deriveModuleSeverity({ state: donorDerived.state, evidenceSeverities: [] }),
      summary: donorDerived.summary,
      counts: donorDerived.counts,
      destination: destDonorOps,
      evidenceRefs: evidenceIndex.filter(e => e.sourceModule === 'donor_ops'),
    },
    {
      module: 'volunteer_ops',
      state: volunteerDerived.state,
      severity: deriveModuleSeverity({ state: volunteerDerived.state, evidenceSeverities: [] }),
      summary: volunteerDerived.summary,
      counts: volunteerDerived.counts,
      destination: destVolunteerOps,
      evidenceRefs: evidenceIndex.filter(e => e.sourceModule === 'volunteer_ops'),
    },
  ];

  const topItems: TopItem[] = [];

  for (const a of alerts) {
    if (!isKnownSeverity(a.severity)) continue;
    topItems.push({
      kind: 'alert',
      severity: a.severity,
      createdAtIso: a.createdAt.toISOString(),
      title: a.title,
      type: a.type,
      alertId: a.id,
      destination: uiDest(`/app/autonomous-ops/alerts/${a.id}`),
      evidenceRefs: evidenceIndex.filter(e => e.refType === 'alert' && e.refId === a.id),
    });
  }
  for (const h of handoffs) {
    topItems.push({
      kind: 'handoff',
      severity: 'MED',
      createdAtIso: h.createdAt.toISOString(),
      title: h.title,
      fromAgentName: h.fromAgentName,
      handoffId: h.id,
      destination: uiDest(`/app/autonomous-ops/handoffs/${h.id}`),
      evidenceRefs: evidenceIndex.filter(e => e.refType === 'handoff' && e.refId === h.id),
    });
  }
  for (const c of complianceOverdue.slice(0, take)) {
    topItems.push({
      kind: 'compliance_calendar',
      severity: 'HIGH',
      dueDateIso: c.dueDate.toISOString(),
      deadlineType: c.deadlineType,
      status: c.status,
      calendarId: c.id,
      destination: uiDest(`/app/compliance/${c.id}`),
      evidenceRefs: evidenceIndex.filter(e => e.refType === 'compliance_calendar' && e.refId === c.id),
    });
  }
  for (const c of complianceDueSoon.slice(0, take)) {
    topItems.push({
      kind: 'compliance_calendar',
      severity: 'MED',
      dueDateIso: c.dueDate.toISOString(),
      deadlineType: c.deadlineType,
      status: c.status,
      calendarId: c.id,
      destination: uiDest(`/app/compliance/${c.id}`),
      evidenceRefs: evidenceIndex.filter(e => e.refType === 'compliance_calendar' && e.refId === c.id),
    });
  }

  topItems.sort((a, b) => {
    const sev = severityRank(b.severity) - severityRank(a.severity);
    if (sev !== 0) return sev;
    const dateA = a.kind === 'compliance_calendar' ? new Date(a.dueDateIso).getTime() : new Date(a.createdAtIso).getTime();
    const dateB = b.kind === 'compliance_calendar' ? new Date(b.dueDateIso).getTime() : new Date(b.createdAtIso).getTime();
    return dateB - dateA;
  });

  moduleStates.sort((a, b) => {
    const state = moduleStateRank(b.state) - moduleStateRank(a.state);
    if (state !== 0) return state;
    const sevA = a.severity ? severityRank(a.severity) : 0;
    const sevB = b.severity ? severityRank(b.severity) : 0;
    return sevB - sevA;
  });

  return {
    orgId: params.orgId,
    asOfIso: now.toISOString(),
    moduleStates,
    topItems: topItems.slice(0, take),
    activeObligations,
    financialSummary,
    evidenceIndex,
    disclaimers: [
      'Internal operator surface only. Verify evidence refs in the DB-backed dashboard before action.',
      'No global health score is computed; ordering is deterministic by severity/state/recency only.',
      'UI destinations are stable identifiers, but may be unimplemented in this repo.',
      'Donor ops reflects only DonorEvent ledger rows (and org Stripe link for configuration); it does not infer donor intent from other income data.',
      'Volunteer ops reflects only VolunteerEvent time rows (sum of recorded hours); it does not value in-kind gifts, deduplicate individuals, or integrate scheduling or messaging systems.',
    ],
  };
}

