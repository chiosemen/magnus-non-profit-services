import { prisma } from '@magnus/db/client';

type CleanupOptions = {
  complianceCalendar?: boolean;
  grantProposal?: boolean;
  grant?: boolean;
};

export async function cleanupIntegrationData(
  orgIds: string[],
  options: CleanupOptions = {}
): Promise<void> {
  if (orgIds.length === 0) {
    return;
  }

  if (options.complianceCalendar) {
    await prisma.complianceCalendar.deleteMany({
      where: { orgId: { in: orgIds } },
    });
  }

  if (options.grantProposal) {
    await prisma.grantProposal.deleteMany({
      where: { orgId: { in: orgIds } },
    });
  }

  if (options.grant) {
    await prisma.grant.deleteMany({
      where: { orgId: { in: orgIds } },
    });
  }

  await prisma.organization.deleteMany({
    where: { id: { in: orgIds } },
  });
}

export async function createOrganizationFixture(input: {
  id: string;
  ein: string;
  name: string;
  subscriptionTier?: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  subscriptionStatus?: 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
}) {
  return prisma.organization.create({
    data: {
      id: input.id,
      ein: input.ein,
      name: input.name,
      subscriptionTier: input.subscriptionTier ?? 'ENTERPRISE',
      subscriptionStatus: input.subscriptionStatus ?? 'ACTIVE',
    },
  });
}

export async function createComplianceCalendarFixture(orgId: string) {
  return prisma.complianceCalendar.create({
    data: {
      orgId,
      deadlineType: 'FORM_990',
      dueDate: new Date('2026-04-15T00:00:00.000Z'),
      status: 'PENDING',
    },
  });
}

export async function createGrantFixture(orgId: string) {
  return prisma.grant.create({
    data: {
      orgId,
      funderName: 'Dashboard Foundation',
      totalAmount: 100000,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
      spentToDate: 25000,
      reportingSchedule: { cadence: 'quarterly' },
    },
  });
}