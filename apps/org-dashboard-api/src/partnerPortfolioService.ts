import { Prisma } from '@magnus/db/types';
import prisma from '@magnus/db/client';
import type { PartnerUserRole } from '@magnus/db/types';
import type { AuditPrepOverallStatus } from './orgAuditPrepService';
import { getOrgAuditPrepSnapshot } from './orgAuditPrepService';
import { getOrgGovernanceSnapshot } from './orgGovernanceService';
import type { StateRegistrationSummary } from './orgStateRegistrationService';
import { getOrgStateRegistrationSnapshot } from './orgStateRegistrationService';

export const PARTNER_PORTFOLIO_DISCLAIMER =
  'Portfolio data is aggregated from each organization’s own internal readiness and compliance trackers. It is not an audit opinion, certification, or compliance guarantee.';

export const MAX_PARTNER_TAGS = 20;
export const MAX_PARTNER_TAG_LENGTH = 64;
export const MAX_PARTNER_NOTES_LENGTH = 4000;

const AUDIT_PREP_STATUSES: readonly AuditPrepOverallStatus[] = [
  'no_items',
  'blocked',
  'overdue',
  'all_complete',
  'in_progress',
];

const SUBSCRIPTION_STATUSES = ['ACTIVE', 'PAST_DUE', 'CANCELED'] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function assertProgramBelongsToPartner(partnerId: string, programId: string): Promise<void> {
  const p = await prisma.partnerProgram.findFirst({ where: { id: programId, partnerId }, select: { id: true } });
  if (!p) throw new PartnerPortfolioInputError('program_not_found');
}

export class PartnerPortfolioInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PartnerPortfolioInputError';
  }
}

export class PartnerPortfolioNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PartnerPortfolioNotFoundError';
  }
}

export interface PartnerPortfolioListFilters {
  isActive?: boolean;
  cohortLabel?: string;
  programId?: string;
  subscriptionStatus?: string;
  auditPrepOverallStatus?: AuditPrepOverallStatus;
  governanceComplete?: boolean;
  stateRegHasOverdueRenewal?: boolean;
}

export interface PartnerPortfolioOrgRow {
  membershipId: string;
  orgId: string;
  name: string;
  ein: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  programId: string | null;
  programLabel: string | null;
  cohortLabel: string | null;
  isActive: boolean;
  partnerNotes: string | null;
  partnerTags: string[];
  governance: {
    complete: boolean;
    issueCount: number;
    completionRate: number;
  };
  stateRegistrations: {
    summary: StateRegistrationSummary;
  };
  auditPrep: {
    overallStatus: string;
    openItems: number;
    blockedItems: number;
    overdueItems: number;
    totalItems: number;
  };
}

export interface PartnerPortfolioSummaryResult {
  partnerId: string;
  disclaimer: string;
  organizations: PartnerPortfolioOrgRow[];
  filtersApplied: PartnerPortfolioListFilters;
  resultCount: number;
}

export type PartnerMembershipPublic = {
  id: string;
  orgId: string;
  programId: string | null;
  programLabel: string | null;
  cohortLabel: string | null;
  isActive: boolean;
  partnerNotes: string | null;
  partnerTags: string[];
};

function firstQueryValue(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) {
    const x = v[0];
    return typeof x === 'string' ? x : undefined;
  }
  return String(v);
}

/**
 * Parse GET /api/partner/portfolio/summary query into list filters.
 * Throws PartnerPortfolioInputError on unknown enum values.
 */
export function parsePartnerPortfolioListFiltersFromQuery(q: Record<string, unknown>): PartnerPortfolioListFilters {
  const out: PartnerPortfolioListFilters = {};
  const g = (k: string) => firstQueryValue(q[k]);

  const isActiveStr = g('isActive');
  if (isActiveStr === 'true') out.isActive = true;
  else if (isActiveStr === 'false') out.isActive = false;
  else if (isActiveStr !== undefined && isActiveStr !== '') {
    throw new PartnerPortfolioInputError('isActive_invalid');
  }

  const cohort = g('cohortLabel');
  if (cohort !== undefined && cohort !== '') out.cohortLabel = cohort;

  const programId = g('programId');
  if (programId !== undefined && programId !== '') {
    if (!UUID_RE.test(programId)) throw new PartnerPortfolioInputError('programId_invalid');
    out.programId = programId;
  }

  const sub = g('subscriptionStatus');
  if (sub) {
    if (!(SUBSCRIPTION_STATUSES as readonly string[]).includes(sub)) {
      throw new PartnerPortfolioInputError('subscriptionStatus_invalid');
    }
    out.subscriptionStatus = sub;
  }

  const audit = g('auditPrepOverallStatus');
  if (audit) {
    if (!(AUDIT_PREP_STATUSES as readonly string[]).includes(audit)) {
      throw new PartnerPortfolioInputError('auditPrepOverallStatus_invalid');
    }
    out.auditPrepOverallStatus = audit as AuditPrepOverallStatus;
  }

  const gc = g('governanceComplete');
  if (gc === 'true') out.governanceComplete = true;
  else if (gc === 'false') out.governanceComplete = false;
  else if (gc !== undefined && gc !== '') throw new PartnerPortfolioInputError('governanceComplete_invalid');

  const sr = g('stateRegHasOverdueRenewal');
  if (sr === 'true') out.stateRegHasOverdueRenewal = true;
  else if (sr === 'false') out.stateRegHasOverdueRenewal = false;
  else if (sr !== undefined && sr !== '') throw new PartnerPortfolioInputError('stateRegHasOverdueRenewal_invalid');

  return out;
}

/** Normalize filters for response echo: viewers never get isActive: false. */
function normalizeFiltersApplied(
  role: PartnerUserRole,
  includeInactive: boolean,
  filters: PartnerPortfolioListFilters
): PartnerPortfolioListFilters {
  const applied: PartnerPortfolioListFilters = { ...filters };
  if (role === 'PARTNER_VIEWER') {
    delete applied.isActive;
  } else if (!includeInactive && applied.isActive === false) {
    delete applied.isActive;
  }
  return applied;
}

export function normalizePartnerTagsInput(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    const t = s.trim();
    if (!t) continue;
    if (t.length > MAX_PARTNER_TAG_LENGTH) {
      throw new PartnerPortfolioInputError('partnerTags_tag_too_long');
    }
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length > MAX_PARTNER_TAGS) {
      throw new PartnerPortfolioInputError('partnerTags_too_many');
    }
  }
  return out;
}

function readOptionalPartnerTags(o: Record<string, unknown>, key: string): string[] | undefined {
  if (!Object.prototype.hasOwnProperty.call(o, key)) return undefined;
  const val = o[key];
  if (!Array.isArray(val)) throw new PartnerPortfolioInputError(`${key}_invalid`);
  for (const x of val) {
    if (typeof x !== 'string') throw new PartnerPortfolioInputError(`${key}_invalid`);
  }
  return normalizePartnerTagsInput(val as string[]);
}

function readOptionalPartnerNotes(o: Record<string, unknown>): string | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(o, 'partnerNotes')) return undefined;
  const val = o['partnerNotes'];
  if (val === null) return null;
  if (val === undefined) return undefined;
  if (typeof val !== 'string') throw new PartnerPortfolioInputError('partnerNotes_invalid');
  const t = val.trim();
  if (t.length > MAX_PARTNER_NOTES_LENGTH) throw new PartnerPortfolioInputError('partnerNotes_too_long');
  return t.length === 0 ? null : t;
}

export async function getPartnerPortfolioSummary(
  partnerId: string,
  params: {
    role: PartnerUserRole;
    includeInactive: boolean;
    filters?: PartnerPortfolioListFilters;
    now?: Date;
  }
): Promise<PartnerPortfolioSummaryResult> {
  const now = params.now ?? new Date();
  const userFilters = params.filters ?? {};
  const viewerOnlyActive = params.role === 'PARTNER_VIEWER' || !params.includeInactive;

  const filtersApplied = normalizeFiltersApplied(params.role, params.includeInactive, userFilters);

  const where: Prisma.PartnerOrgMembershipWhereInput = { partnerId };

  if (viewerOnlyActive) {
    where.isActive = true;
  } else if (typeof userFilters.isActive === 'boolean') {
    where.isActive = userFilters.isActive;
  }

  if (userFilters.cohortLabel !== undefined && userFilters.cohortLabel !== '') {
    where.cohortLabel = userFilters.cohortLabel;
  }

  if (userFilters.programId) {
    where.programId = userFilters.programId;
  }

  if (userFilters.subscriptionStatus) {
    where.org = {
      subscriptionStatus: userFilters.subscriptionStatus as (typeof SUBSCRIPTION_STATUSES)[number],
    };
  }

  const memberships = await prisma.partnerOrgMembership.findMany({
    where,
    include: {
      program: { select: { id: true, label: true } },
      org: {
        select: {
          id: true,
          name: true,
          ein: true,
          subscriptionTier: true,
          subscriptionStatus: true,
        },
      },
    },
    orderBy: [{ orgId: 'asc' }],
  });

  const organizations: PartnerPortfolioOrgRow[] = [];

  for (const row of memberships) {
    const orgId = row.org.id;
    const [gov, stateReg, audit] = await Promise.all([
      getOrgGovernanceSnapshot(orgId),
      getOrgStateRegistrationSnapshot(orgId, now),
      getOrgAuditPrepSnapshot(orgId, now),
    ]);

    const overdueRenewals = stateReg.summary.overdueRenewals;
    const govComplete = gov.readiness.complete;
    const auditStatus = audit.summary.overallStatus;

    if (userFilters.auditPrepOverallStatus !== undefined && auditStatus !== userFilters.auditPrepOverallStatus) {
      continue;
    }
    if (userFilters.governanceComplete !== undefined && govComplete !== userFilters.governanceComplete) {
      continue;
    }
    if (userFilters.stateRegHasOverdueRenewal !== undefined) {
      const hasOverdue = overdueRenewals > 0;
      if (hasOverdue !== userFilters.stateRegHasOverdueRenewal) continue;
    }

    organizations.push({
      membershipId: row.id,
      orgId: row.org.id,
      name: row.org.name,
      ein: row.org.ein,
      subscriptionTier: row.org.subscriptionTier,
      subscriptionStatus: row.org.subscriptionStatus,
      programId: row.programId,
      programLabel: row.program?.label ?? null,
      cohortLabel: row.cohortLabel,
      isActive: row.isActive,
      partnerNotes: row.partnerNotes,
      partnerTags: [...row.partnerTags],
      governance: {
        complete: govComplete,
        issueCount: gov.readiness.issueCount,
        completionRate: gov.readiness.completionRate,
      },
      stateRegistrations: { summary: stateReg.summary },
      auditPrep: {
        overallStatus: auditStatus,
        openItems: audit.summary.openItems,
        blockedItems: audit.summary.blockedItems,
        overdueItems: audit.summary.overdueItems,
        totalItems: audit.summary.totalItems,
      },
    });
  }

  return {
    partnerId,
    disclaimer: PARTNER_PORTFOLIO_DISCLAIMER,
    organizations,
    filtersApplied,
    resultCount: organizations.length,
  };
}

export async function linkManagedOrganization(
  partnerId: string,
  input: {
    orgId: string;
    programId?: string | null;
    cohortLabel?: string | null;
    partnerNotes?: string | null;
    partnerTags?: string[];
  }
): Promise<PartnerMembershipPublic> {
  const org = await prisma.organization.findUnique({ where: { id: input.orgId }, select: { id: true } });
  if (!org) throw new PartnerPortfolioNotFoundError('ORG_NOT_FOUND');

  const data: Prisma.PartnerOrgMembershipCreateInput = {
    partner: { connect: { id: partnerId } },
    org: { connect: { id: input.orgId } },
    cohortLabel: input.cohortLabel ?? null,
  };
  if (Object.prototype.hasOwnProperty.call(input, 'programId') && input.programId != null) {
    await assertProgramBelongsToPartner(partnerId, input.programId);
    data.program = { connect: { id: input.programId } };
  }
  if (Object.prototype.hasOwnProperty.call(input, 'partnerNotes')) {
    if (input.partnerNotes === null || input.partnerNotes === undefined) {
      data.partnerNotes = null;
    } else {
      const t = input.partnerNotes.trim();
      if (t.length > MAX_PARTNER_NOTES_LENGTH) throw new PartnerPortfolioInputError('partnerNotes_too_long');
      data.partnerNotes = t.length === 0 ? null : t;
    }
  }
  if (input.partnerTags !== undefined) {
    data.partnerTags = normalizePartnerTagsInput(input.partnerTags);
  }

  try {
    const created = await prisma.partnerOrgMembership.create({
      data,
      include: { program: { select: { id: true, label: true } } },
    });
    return membershipToPublic(created);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new PartnerPortfolioInputError('PARTNER_ORG_ALREADY_LINKED');
    }
    throw err;
  }
}

function membershipToPublic(m: {
  id: string;
  orgId: string;
  programId: string | null;
  cohortLabel: string | null;
  isActive: boolean;
  partnerNotes: string | null;
  partnerTags: string[];
  program?: { id: string; label: string } | null;
}): PartnerMembershipPublic {
  return {
    id: m.id,
    orgId: m.orgId,
    programId: m.programId,
    programLabel: m.program?.label ?? null,
    cohortLabel: m.cohortLabel,
    isActive: m.isActive,
    partnerNotes: m.partnerNotes,
    partnerTags: [...m.partnerTags],
  };
}

export async function updateManagedOrganization(
  partnerId: string,
  orgId: string,
  patch: {
    programId?: string | null;
    cohortLabel?: string | null;
    isActive?: boolean;
    partnerNotes?: string | null;
    partnerTags?: string[];
  }
): Promise<PartnerMembershipPublic> {
  const membership = await prisma.partnerOrgMembership.findFirst({
    where: { partnerId, orgId },
  });
  if (!membership) throw new PartnerPortfolioNotFoundError('PARTNER_MEMBERSHIP_NOT_FOUND');

  const data: Prisma.PartnerOrgMembershipUpdateInput = {};
  if (Object.prototype.hasOwnProperty.call(patch, 'programId')) {
    if (patch.programId === null || patch.programId === undefined) {
      data.program = { disconnect: true };
    } else {
      await assertProgramBelongsToPartner(partnerId, patch.programId);
      data.program = { connect: { id: patch.programId } };
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'cohortLabel')) {
    data.cohortLabel = patch.cohortLabel ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'isActive') && typeof patch.isActive === 'boolean') {
    data.isActive = patch.isActive;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'partnerNotes')) {
    if (patch.partnerNotes === null) {
      data.partnerNotes = null;
    } else if (typeof patch.partnerNotes === 'string') {
      const t = patch.partnerNotes.trim();
      if (t.length > MAX_PARTNER_NOTES_LENGTH) throw new PartnerPortfolioInputError('partnerNotes_too_long');
      data.partnerNotes = t.length === 0 ? null : t;
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'partnerTags') && patch.partnerTags !== undefined) {
    data.partnerTags = { set: normalizePartnerTagsInput(patch.partnerTags) };
  }

  const updated = await prisma.partnerOrgMembership.update({
    where: { id: membership.id },
    data,
    include: { program: { select: { id: true, label: true } } },
  });
  return membershipToPublic(updated);
}

function readOptionalProgramId(o: Record<string, unknown>): string | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(o, 'programId')) return undefined;
  const v = o['programId'];
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw new PartnerPortfolioInputError('programId_invalid');
  return v;
}

export function parseLinkManagedOrgBody(body: unknown): {
  orgId: string;
  programId?: string | null;
  cohortLabel?: string | null;
  partnerNotes?: string | null;
  partnerTags?: string[];
} {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new PartnerPortfolioInputError('object_body_required');
  }
  const o = body as Record<string, unknown>;
  if (typeof o['orgId'] !== 'string' || o['orgId'].trim().length === 0) {
    throw new PartnerPortfolioInputError('orgId_required');
  }
  const result: {
    orgId: string;
    programId?: string | null;
    cohortLabel?: string | null;
    partnerNotes?: string | null;
    partnerTags?: string[];
  } = { orgId: o['orgId'].trim() };
  const pid = readOptionalProgramId(o);
  if (pid !== undefined) result.programId = pid;
  if (Object.prototype.hasOwnProperty.call(o, 'cohortLabel')) {
    if (o['cohortLabel'] === null || o['cohortLabel'] === undefined) {
      result.cohortLabel = null;
    } else if (typeof o['cohortLabel'] === 'string') {
      result.cohortLabel = o['cohortLabel'].trim() || null;
    } else {
      throw new PartnerPortfolioInputError('cohortLabel_invalid');
    }
  }
  const notes = readOptionalPartnerNotes(o);
  if (notes !== undefined) result.partnerNotes = notes;
  const tags = readOptionalPartnerTags(o, 'partnerTags');
  if (tags !== undefined) result.partnerTags = tags;
  return result;
}

export function parseUpdateManagedOrgBody(body: unknown): {
  programId?: string | null;
  cohortLabel?: string | null;
  isActive?: boolean;
  partnerNotes?: string | null;
  partnerTags?: string[];
} {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new PartnerPortfolioInputError('object_body_required');
  }
  const o = body as Record<string, unknown>;
  const result: {
    programId?: string | null;
    cohortLabel?: string | null;
    isActive?: boolean;
    partnerNotes?: string | null;
    partnerTags?: string[];
  } = {};
  const pid = readOptionalProgramId(o);
  if (pid !== undefined) result.programId = pid;
  if (Object.prototype.hasOwnProperty.call(o, 'cohortLabel')) {
    if (o['cohortLabel'] === null) result.cohortLabel = null;
    else if (typeof o['cohortLabel'] === 'string') result.cohortLabel = o['cohortLabel'].trim() || null;
    else throw new PartnerPortfolioInputError('cohortLabel_invalid');
  }
  if (Object.prototype.hasOwnProperty.call(o, 'isActive')) {
    if (typeof o['isActive'] !== 'boolean') throw new PartnerPortfolioInputError('isActive_invalid');
    result.isActive = o['isActive'];
  }
  const notes = readOptionalPartnerNotes(o);
  if (notes !== undefined) result.partnerNotes = notes;
  const tags = readOptionalPartnerTags(o, 'partnerTags');
  if (tags !== undefined) result.partnerTags = tags;
  if (Object.keys(result).length === 0) throw new PartnerPortfolioInputError('no_updatable_fields');
  return result;
}
