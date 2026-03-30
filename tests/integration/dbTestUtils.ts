import { prisma } from '@magnus/db/client';

type CleanupOptions = {
  auditPrepItem?: boolean;
  boardGovernanceMember?: boolean;
  complianceCalendar?: boolean;
  grantProposal?: boolean;
  grant?: boolean;
  governanceProfile?: boolean;
  institutionalPartner?: boolean;
  orgStateRegistration?: boolean;
  partnerOrgMembership?: boolean;
  partnerUser?: boolean;
};

export async function cleanupIntegrationData(
  orgIds: string[],
  options: CleanupOptions = {}
): Promise<void> {
  if (orgIds.length === 0) return;

  if (options.auditPrepItem) {
    await prisma.orgAuditPrepItem.deleteMany({
      where: { orgId: { in: orgIds } },
    });
  }

  if (options.complianceCalendar) {
    await prisma.complianceCalendar.deleteMany({
      where: { orgId: { in: orgIds } },
    });
  }

  if (options.boardGovernanceMember) {
    await prisma.boardGovernanceMember.deleteMany({
      where: { orgId: { in: orgIds } },
    });
  }

  if (options.governanceProfile) {
    await prisma.governanceProfile.deleteMany({
      where: { orgId: { in: orgIds } },
    });
  }

  if (options.orgStateRegistration) {
    await prisma.orgStateRegistration.deleteMany({
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

  const billingPartnerIds =
    options.partnerOrgMembership || options.partnerUser || options.institutionalPartner
      ? (
          await prisma.institutionalPartner.findMany({
            where: { billingOrgId: { in: orgIds } },
            select: { id: true },
          })
        ).map(p => p.id)
      : [];

  if (options.partnerOrgMembership) {
    await prisma.partnerOrgMembership.deleteMany({
      where: {
        OR: [
          { orgId: { in: orgIds } },
          ...(billingPartnerIds.length > 0 ? [{ partnerId: { in: billingPartnerIds } }] : []),
        ],
      },
    });
  }

  if (options.partnerUser && billingPartnerIds.length > 0) {
    await prisma.partnerUser.deleteMany({
      where: { partnerId: { in: billingPartnerIds } },
    });
  }

  if (options.institutionalPartner && billingPartnerIds.length > 0) {
    await prisma.institutionalPartner.deleteMany({
      where: { id: { in: billingPartnerIds } },
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

export async function createGovernanceProfileFixture(
  orgId: string,
  overrides: Partial<{
    conflictOfInterestPolicy: boolean;
    whistleblowerPolicy: boolean;
    documentRetentionPolicy: boolean;
  }> = {}
) {
  return prisma.governanceProfile.create({
    data: {
      orgId,
      conflictOfInterestPolicy: overrides.conflictOfInterestPolicy ?? false,
      whistleblowerPolicy: overrides.whistleblowerPolicy ?? false,
      documentRetentionPolicy: overrides.documentRetentionPolicy ?? false,
    },
  });
}

export async function createBoardGovernanceMemberFixture(
  orgId: string,
  input: {
    name: string;
    officerRole?: 'CHAIR' | 'VICE_CHAIR' | 'TREASURER' | 'SECRETARY' | 'PRESIDENT' | 'MEMBER_AT_LARGE' | 'OTHER' | null;
    termStart?: Date | null;
    termEnd?: Date | null;
    conflictDisclosureSignedAt?: Date | null;
    meetingsHeld?: number | null;
    meetingsAttended?: number | null;
  }
) {
  return prisma.boardGovernanceMember.create({
    data: {
      orgId,
      name: input.name,
      ...(input.officerRole !== undefined ? { officerRole: input.officerRole } : {}),
      ...(input.termStart !== undefined ? { termStart: input.termStart } : {}),
      ...(input.termEnd !== undefined ? { termEnd: input.termEnd } : {}),
      ...(input.conflictDisclosureSignedAt !== undefined
        ? { conflictDisclosureSignedAt: input.conflictDisclosureSignedAt }
        : {}),
      ...(input.meetingsHeld !== undefined ? { meetingsHeld: input.meetingsHeld } : {}),
      ...(input.meetingsAttended !== undefined ? { meetingsAttended: input.meetingsAttended } : {}),
    },
  });
}

export async function createOrgStateRegistrationFixture(
  orgId: string,
  input: {
    stateCode: string;
    status: 'ACTIVE' | 'PENDING' | 'NOT_REGISTERED' | 'UNKNOWN';
    solicitsDonations?: boolean;
    renewalDueDate?: Date | null;
    renewalNotes?: string | null;
  }
) {
  return prisma.orgStateRegistration.create({
    data: {
      orgId,
      stateCode: input.stateCode,
      status: input.status,
      solicitsDonations: input.solicitsDonations ?? true,
      ...(input.renewalDueDate !== undefined ? { renewalDueDate: input.renewalDueDate } : {}),
      ...(input.renewalNotes !== undefined ? { renewalNotes: input.renewalNotes } : {}),
    },
  });
}
