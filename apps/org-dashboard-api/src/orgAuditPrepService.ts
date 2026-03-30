import prisma from '@magnus/db/client';
import type { AuditPrepCategory, AuditPrepItemStatus, OrgAuditPrepItem } from '@magnus/db/types';

export const AUDIT_PREP_DISCLAIMER =
  'Internal preparation tracking only. This is not an audit opinion, certification, or auditor sign-off.';

export type AuditPrepOverallStatus = 'no_items' | 'blocked' | 'overdue' | 'all_complete' | 'in_progress';

export interface AuditPrepReadinessSummary {
  totalItems: number;
  openItems: number;
  blockedItems: number;
  overdueItems: number;
  overallStatus: AuditPrepOverallStatus;
  explanation: string[];
}

export type AuditPrepTemplateRow = {
  templateItemKey: string;
  category: AuditPrepCategory;
  title: string;
};

export const AUDIT_PREP_TEMPLATE_ITEMS: AuditPrepTemplateRow[] = [
  {
    templateItemKey: 'governance.board_minutes_fy',
    category: 'GOVERNANCE_BOARD_MINUTES',
    title: 'Board meeting minutes for the fiscal year (signed / approved)',
  },
  {
    templateItemKey: 'governance.committee_minutes_major',
    category: 'GOVERNANCE_BOARD_MINUTES',
    title: 'Minutes for major committees (finance, executive, etc.) supporting the audit period',
  },
  {
    templateItemKey: 'governance.board_actions_written_consent',
    category: 'GOVERNANCE_BOARD_MINUTES',
    title: 'Written consents or resolutions for significant actions during the year',
  },
  {
    templateItemKey: 'bank.statements_all_accounts',
    category: 'BANK_CASH_RECONCILIATIONS',
    title: 'Bank statements for all active accounts through period end',
  },
  {
    templateItemKey: 'bank.reconciliations_period_end',
    category: 'BANK_CASH_RECONCILIATIONS',
    title: 'Bank reconciliations through period end with outstanding items listed',
  },
  {
    templateItemKey: 'bank.petty_cash_imprest',
    category: 'BANK_CASH_RECONCILIATIONS',
    title: 'Petty cash / imprest records and counts (if applicable)',
  },
  {
    templateItemKey: 'payroll.tax_returns_quarterly_annual',
    category: 'PAYROLL_COMPENSATION',
    title: 'Payroll tax returns (941/state) and W-2/W-3 filing support for the year',
  },
  {
    templateItemKey: 'payroll.compensation_approval',
    category: 'PAYROLL_COMPENSATION',
    title: 'Documentation of board or authorized approval for executive compensation (if applicable)',
  },
  {
    templateItemKey: 'payroll.personnel_files_key_docs',
    category: 'PAYROLL_COMPENSATION',
    title: 'Personnel / contractor file index and key agreements for audit sample support',
  },
  {
    templateItemKey: 'grant.restricted_fund_schedule',
    category: 'GRANT_RESTRICTED_FUNDS',
    title: 'Restricted fund or net asset classification schedule reconciling to the trial balance',
  },
  {
    templateItemKey: 'grant.agreements_and_reports',
    category: 'GRANT_RESTRICTED_FUNDS',
    title: 'Grant agreements and funder reports for restricted activities in the audit period',
  },
  {
    templateItemKey: 'grant.subrecipient_monitoring',
    category: 'GRANT_RESTRICTED_FUNDS',
    title: 'Subrecipient or pass-through monitoring documentation (if applicable)',
  },
  {
    templateItemKey: 'contracts.lease_agreements',
    category: 'CONTRACTS_LEASES_AGREEMENTS',
    title: 'Lease agreements and amortization schedules (operating/finance as applicable)',
  },
  {
    templateItemKey: 'contracts.major_service_vendors',
    category: 'CONTRACTS_LEASES_AGREEMENTS',
    title: 'Material service contracts (e.g. payroll, IT, facilities) active in the period',
  },
  {
    templateItemKey: 'contracts.related_party_transactions',
    category: 'CONTRACTS_LEASES_AGREEMENTS',
    title: 'Related-party transaction listing with approvals or disclosures',
  },
  {
    templateItemKey: 'prior_year.findings_list',
    category: 'PRIOR_YEAR_FINDING_REMEDIATION',
    title: 'Prior-year audit or A-133 findings and management responses (if applicable)',
  },
  {
    templateItemKey: 'prior_year.remediation_evidence',
    category: 'PRIOR_YEAR_FINDING_REMEDIATION',
    title: 'Evidence of remediation actions completed for prior findings',
  },
  {
    templateItemKey: 'prior_year.open_items_follow_up',
    category: 'PRIOR_YEAR_FINDING_REMEDIATION',
    title: 'Open remediation items with owners and target dates documented',
  },
];

type ItemForSummary = Pick<OrgAuditPrepItem, 'status' | 'targetDate'>;

export function startOfUtcDayMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function buildAuditPrepReadinessSummary(
  items: ItemForSummary[],
  now: Date
): AuditPrepReadinessSummary {
  const totalItems = items.length;
  const openItems = items.filter(i => i.status !== 'COMPLETE').length;
  const blockedItems = items.filter(i => i.status === 'BLOCKED').length;
  const nowDay = startOfUtcDayMs(now);
  const overdueItems = items.filter(i => {
    if (i.status === 'COMPLETE' || i.targetDate === null) return false;
    return startOfUtcDayMs(i.targetDate) < nowDay;
  }).length;

  let overallStatus: AuditPrepOverallStatus;
  if (totalItems === 0) {
    overallStatus = 'no_items';
  } else if (blockedItems > 0) {
    overallStatus = 'blocked';
  } else if (overdueItems > 0) {
    overallStatus = 'overdue';
  } else if (openItems === 0) {
    overallStatus = 'all_complete';
  } else {
    overallStatus = 'in_progress';
  }

  const explanation: string[] = [];
  if (overallStatus === 'no_items') {
    explanation.push('No audit prep items yet; apply the checklist template to get started.');
  } else {
    explanation.push(`Open items: ${openItems} of ${totalItems} total.`);
    if (blockedItems > 0) {
      explanation.push(`${blockedItems} item(s) are blocked.`);
    }
    if (overdueItems > 0) {
      explanation.push(`${overdueItems} open item(s) are past their target date.`);
    }
    if (overallStatus === 'all_complete') {
      explanation.push('Every item is marked complete.');
    }
    if (overallStatus === 'in_progress') {
      explanation.push('Work is in progress on open items.');
    }
  }

  return {
    totalItems,
    openItems,
    blockedItems,
    overdueItems,
    overallStatus,
    explanation,
  };
}

export interface OrgAuditPrepItemDto {
  id: string;
  orgId: string;
  templateItemKey: string;
  category: AuditPrepCategory;
  title: string;
  status: AuditPrepItemStatus;
  targetDate: string | null;
  assignee: string | null;
  notes: string | null;
  evidenceReference: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrgAuditPrepSnapshot {
  orgId: string;
  disclaimer: string;
  items: OrgAuditPrepItemDto[];
  summary: AuditPrepReadinessSummary;
}

export class AuditPrepInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuditPrepInputError';
  }
}

export class AuditPrepNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuditPrepNotFoundError';
  }
}

export type OrgAuditPrepItemUpdateInput = {
  status?: AuditPrepItemStatus;
  targetDate?: Date | null;
  assignee?: string | null;
  notes?: string | null;
  evidenceReference?: string | null;
};

export function toOrgAuditPrepItemDto(row: OrgAuditPrepItem): OrgAuditPrepItemDto {
  return {
    id: row.id,
    orgId: row.orgId,
    templateItemKey: row.templateItemKey,
    category: row.category,
    title: row.title,
    status: row.status,
    targetDate: row.targetDate ? row.targetDate.toISOString() : null,
    assignee: row.assignee,
    notes: row.notes,
    evidenceReference: row.evidenceReference,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listOrgAuditPrepItems(orgId: string): Promise<OrgAuditPrepItem[]> {
  return prisma.orgAuditPrepItem.findMany({
    where: { orgId },
    orderBy: [{ category: 'asc' }, { templateItemKey: 'asc' }],
  });
}

export async function applyAuditPrepTemplate(orgId: string): Promise<{ createdCount: number }> {
  const result = await prisma.orgAuditPrepItem.createMany({
    data: AUDIT_PREP_TEMPLATE_ITEMS.map(t => ({
      orgId,
      templateItemKey: t.templateItemKey,
      category: t.category,
      title: t.title,
    })),
    skipDuplicates: true,
  });
  return { createdCount: result.count };
}

export async function getOrgAuditPrepSnapshot(orgId: string, now = new Date()): Promise<OrgAuditPrepSnapshot> {
  const items = await listOrgAuditPrepItems(orgId);
  const summary = buildAuditPrepReadinessSummary(items, now);
  return {
    orgId,
    disclaimer: AUDIT_PREP_DISCLAIMER,
    items: items.map(toOrgAuditPrepItemDto),
    summary,
  };
}

export async function updateOrgAuditPrepItem(
  orgId: string,
  itemId: string,
  patch: OrgAuditPrepItemUpdateInput
): Promise<OrgAuditPrepItem> {
  const existing = await prisma.orgAuditPrepItem.findFirst({
    where: { id: itemId, orgId },
  });
  if (!existing) {
    throw new AuditPrepNotFoundError('AUDIT_PREP_ITEM_NOT_FOUND');
  }

  const data: {
    status?: AuditPrepItemStatus;
    targetDate?: Date | null;
    assignee?: string | null;
    notes?: string | null;
    evidenceReference?: string | null;
  } = {};

  if (Object.prototype.hasOwnProperty.call(patch, 'status') && patch.status !== undefined) {
    data.status = patch.status;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'targetDate')) {
    data.targetDate = patch.targetDate ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'assignee')) {
    data.assignee = patch.assignee ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'notes')) {
    data.notes = patch.notes ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'evidenceReference')) {
    data.evidenceReference = patch.evidenceReference ?? null;
  }

  if (Object.keys(data).length === 0) {
    return existing;
  }

  return prisma.orgAuditPrepItem.update({
    where: { id: itemId },
    data,
  });
}

export function parseAuditPrepItemPatch(body: unknown): OrgAuditPrepItemUpdateInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new AuditPrepInputError('object_body_required');
  }
  const input = body as Record<string, unknown>;
  const result: OrgAuditPrepItemUpdateInput = {};

  if (Object.prototype.hasOwnProperty.call(input, 'status')) {
    result.status = parseAuditPrepItemStatus(input['status']);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'targetDate')) {
    result.targetDate = parseOptionalDateField(input['targetDate'], 'targetDate');
  }
  if (Object.prototype.hasOwnProperty.call(input, 'assignee')) {
    result.assignee = parseOptionalTrimmedString(input['assignee'], 'assignee');
  }
  if (Object.prototype.hasOwnProperty.call(input, 'notes')) {
    result.notes = parseOptionalStringAllowEmpty(input['notes'], 'notes');
  }
  if (Object.prototype.hasOwnProperty.call(input, 'evidenceReference')) {
    result.evidenceReference = parseOptionalStringAllowEmpty(input['evidenceReference'], 'evidenceReference');
  }

  if (Object.keys(result).length === 0) {
    throw new AuditPrepInputError('no_updatable_fields');
  }

  return result;
}

function parseAuditPrepItemStatus(value: unknown): AuditPrepItemStatus {
  if (
    value === 'NOT_STARTED' ||
    value === 'IN_PROGRESS' ||
    value === 'COMPLETE' ||
    value === 'BLOCKED'
  ) {
    return value;
  }
  throw new AuditPrepInputError('status_invalid');
}

function parseOptionalDateField(value: unknown, field: string): Date | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new AuditPrepInputError(`${field}_required_date_string`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AuditPrepInputError(`${field}_invalid_date`);
  }
  return parsed;
}

function parseOptionalTrimmedString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new AuditPrepInputError(`${field}_required_string`);
  }
  const t = value.trim();
  return t.length === 0 ? null : t;
}

function parseOptionalStringAllowEmpty(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new AuditPrepInputError(`${field}_required_string`);
  }
  return value;
}
