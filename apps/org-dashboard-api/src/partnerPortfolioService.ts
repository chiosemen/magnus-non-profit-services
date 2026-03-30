import { Prisma } from '@magnus/db/types';
import prisma from '@magnus/db/client';
import type { PartnerUserRole } from '@magnus/db/types';
import { getOrgAuditPrepSnapshot } from './orgAuditPrepService';
import { getOrgGovernanceSnapshot } from './orgGovernanceService';
import type { StateRegistrationSummary } from './orgStateRegistrationService';
import { getOrgStateRegistrationSnapshot } from './orgStateRegistrationService';

export const PARTNER_PORTFOLIO_DISCLAIMER =
  'Portfolio data is aggregated from each organization’s own internal readiness and compliance trackers. It is not an audit opinion, certification, or compliance guarantee.';

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

export interface PartnerPortfolioOrgRow {
  orgId: string;
  name: string;
  ein: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  cohortLabel: string | null;
  isActive: boolean;
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
}

export async function getPartnerPortfolioSummary(
  partnerId: string,
  params: { role: PartnerUserRole; includeInactive: boolean; now?: Date }
): Promise<PartnerPortfolioSummaryResult> {
  const now = params.now ?? new Date();
  const viewerOnlyActive = params.role === 'PARTNER_VIEWER' || !params.includeInactive;

  const memberships = await prisma.partnerOrgMembership.findMany({
    where: {
      partnerId,
      ...(viewerOnlyActive ? { isActive: true } : {}),
    },
    include: {
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

    organizations.push({
      orgId: row.org.id,
      name: row.org.name,
      ein: row.org.ein,
      subscriptionTier: row.org.subscriptionTier,
      subscriptionStatus: row.org.subscriptionStatus,
      cohortLabel: row.cohortLabel,
      isActive: row.isActive,
      governance: {
        complete: gov.readiness.complete,
        issueCount: gov.readiness.issueCount,
        completionRate: gov.readiness.completionRate,
      },
      stateRegistrations: { summary: stateReg.summary },
      auditPrep: {
        overallStatus: audit.summary.overallStatus,
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
  };
}

export async function linkManagedOrganization(
  partnerId: string,
  input: { orgId: string; cohortLabel?: string | null }
): Promise<{ id: string; orgId: string; cohortLabel: string | null; isActive: boolean }> {
  const org = await prisma.organization.findUnique({ where: { id: input.orgId }, select: { id: true } });
  if (!org) throw new PartnerPortfolioNotFoundError('ORG_NOT_FOUND');

  try {
    const created = await prisma.partnerOrgMembership.create({
      data: {
        partnerId,
        orgId: input.orgId,
        cohortLabel: input.cohortLabel ?? null,
      },
    });
    return {
      id: created.id,
      orgId: created.orgId,
      cohortLabel: created.cohortLabel,
      isActive: created.isActive,
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new PartnerPortfolioInputError('PARTNER_ORG_ALREADY_LINKED');
    }
    throw err;
  }
}

export async function updateManagedOrganization(
  partnerId: string,
  orgId: string,
  patch: { cohortLabel?: string | null; isActive?: boolean }
): Promise<{ id: string; orgId: string; cohortLabel: string | null; isActive: boolean }> {
  const membership = await prisma.partnerOrgMembership.findFirst({
    where: { partnerId, orgId },
  });
  if (!membership) throw new PartnerPortfolioNotFoundError('PARTNER_MEMBERSHIP_NOT_FOUND');

  const data: { cohortLabel?: string | null; isActive?: boolean } = {};
  if (Object.prototype.hasOwnProperty.call(patch, 'cohortLabel')) {
    data.cohortLabel = patch.cohortLabel ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'isActive') && typeof patch.isActive === 'boolean') {
    data.isActive = patch.isActive;
  }

  const updated = await prisma.partnerOrgMembership.update({
    where: { id: membership.id },
    data,
  });
  return {
    id: updated.id,
    orgId: updated.orgId,
    cohortLabel: updated.cohortLabel,
    isActive: updated.isActive,
  };
}

export function parseLinkManagedOrgBody(body: unknown): { orgId: string; cohortLabel?: string | null } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new PartnerPortfolioInputError('object_body_required');
  }
  const o = body as Record<string, unknown>;
  if (typeof o['orgId'] !== 'string' || o['orgId'].trim().length === 0) {
    throw new PartnerPortfolioInputError('orgId_required');
  }
  const result: { orgId: string; cohortLabel?: string | null } = { orgId: o['orgId'].trim() };
  if (Object.prototype.hasOwnProperty.call(o, 'cohortLabel')) {
    if (o['cohortLabel'] === null || o['cohortLabel'] === undefined) {
      result.cohortLabel = null;
    } else if (typeof o['cohortLabel'] === 'string') {
      result.cohortLabel = o['cohortLabel'].trim() || null;
    } else {
      throw new PartnerPortfolioInputError('cohortLabel_invalid');
    }
  }
  return result;
}

export function parseUpdateManagedOrgBody(body: unknown): { cohortLabel?: string | null; isActive?: boolean } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new PartnerPortfolioInputError('object_body_required');
  }
  const o = body as Record<string, unknown>;
  const result: { cohortLabel?: string | null; isActive?: boolean } = {};
  if (Object.prototype.hasOwnProperty.call(o, 'cohortLabel')) {
    if (o['cohortLabel'] === null) result.cohortLabel = null;
    else if (typeof o['cohortLabel'] === 'string') result.cohortLabel = o['cohortLabel'].trim() || null;
    else throw new PartnerPortfolioInputError('cohortLabel_invalid');
  }
  if (Object.prototype.hasOwnProperty.call(o, 'isActive')) {
    if (typeof o['isActive'] !== 'boolean') throw new PartnerPortfolioInputError('isActive_invalid');
    result.isActive = o['isActive'];
  }
  if (Object.keys(result).length === 0) throw new PartnerPortfolioInputError('no_updatable_fields');
  return result;
}
