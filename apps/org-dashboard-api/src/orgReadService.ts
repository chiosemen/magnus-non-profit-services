import prisma from '@magnus/db/client';
import type { ComplianceCalendar, Grant, Organization, Prisma } from '@magnus/db/types';

export type OrgLookup = { orgId?: string; ein?: string };

function requireOrgWhere(lookup: OrgLookup): Prisma.OrganizationWhereUniqueInput {
  if (lookup.orgId) return { id: lookup.orgId };
  if (lookup.ein) return { ein: lookup.ein };
  throw new Error('orgId_or_ein_required');
}

export type OrgOverview = Pick<
  Organization,
  | 'id'
  | 'ein'
  | 'name'
  | 'annualRevenue'
  | 'fiscalYearEnd'
  | 'subscriptionTier'
  | 'stripeAccountId'
  | 'createdAt'
  | 'updatedAt'
> & {
  _count: {
    complianceCalendar: number;
    grants: number;
    workerRelationships: number;
    incomeTransactions: number;
  };
};

export async function getOrgOverview(lookup: OrgLookup): Promise<OrgOverview | null> {
  const where = requireOrgWhere(lookup);

  return prisma.organization.findUnique({
    where,
    select: {
      id: true,
      ein: true,
      name: true,
      annualRevenue: true,
      fiscalYearEnd: true,
      subscriptionTier: true,
      stripeAccountId: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          complianceCalendar: true,
          grants: true,
          workerRelationships: true,
          incomeTransactions: true,
        },
      },
    },
  });
}

export async function getOrgComplianceCalendar(orgId: string): Promise<ComplianceCalendar[]> {
  return prisma.complianceCalendar.findMany({
    where: { orgId },
    orderBy: [{ dueDate: 'asc' }],
  });
}

export async function getOrgGrants(orgId: string): Promise<Grant[]> {
  return prisma.grant.findMany({
    where: { orgId },
    orderBy: [{ endDate: 'desc' }],
  });
}
