import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@magnus/db/types';
import prisma from '@magnus/db/client';
import {
  getPartnerPortfolioSummary,
  linkManagedOrganization,
  parseLinkManagedOrgBody,
  parseUpdateManagedOrgBody,
  PartnerPortfolioInputError,
  PartnerPortfolioNotFoundError,
  updateManagedOrganization,
} from '../../apps/org-dashboard-api/src/partnerPortfolioService';

const PARTNER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BILLING_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MANAGED_ORG = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const USER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const govMock = vi.hoisted(() => vi.fn());
const stateMock = vi.hoisted(() => vi.fn());
const auditMock = vi.hoisted(() => vi.fn());

vi.mock('../../apps/org-dashboard-api/src/orgGovernanceService', () => ({
  getOrgGovernanceSnapshot: (...args: unknown[]) => govMock(...args),
}));

vi.mock('../../apps/org-dashboard-api/src/orgStateRegistrationService', () => ({
  getOrgStateRegistrationSnapshot: (...args: unknown[]) => stateMock(...args),
}));

vi.mock('../../apps/org-dashboard-api/src/orgAuditPrepService', () => ({
  getOrgAuditPrepSnapshot: (...args: unknown[]) => auditMock(...args),
}));

type MockMembership = {
  id: string;
  partnerId: string;
  orgId: string;
  cohortLabel: string | null;
  isActive: boolean;
  org: {
    id: string;
    name: string;
    ein: string;
    subscriptionTier: string;
    subscriptionStatus: string;
  };
};

const dbState = vi.hoisted(() => {
  let organizations: Array<{ id: string }> = [];
  let memberships: MockMembership[] = [];
  let lastFindManyWhere: Record<string, unknown> | null = null;

  return {
    reset() {
      organizations = [];
      memberships = [];
      lastFindManyWhere = null;
    },
    seedOrg(id: string) {
      organizations.push({ id });
    },
    seedMembership(row: Omit<MockMembership, 'org'> & { org?: MockMembership['org'] }) {
      const org = row.org ?? {
        id: row.orgId,
        name: 'Test Org',
        ein: '123456789',
        subscriptionTier: 'STARTER',
        subscriptionStatus: 'ACTIVE',
      };
      memberships.push({ ...row, org });
    },
    get lastFindManyWhere() {
      return lastFindManyWhere;
    },
    organization: {
      async findUnique(args: { where: { id: string }; select?: { id: boolean } }) {
        const o = organizations.find(x => x.id === args.where.id);
        return o ? { id: o.id } : null;
      },
    },
    partnerOrgMembership: {
      async findMany(args: { where: Record<string, unknown>; include?: unknown; orderBy?: unknown }) {
        lastFindManyWhere = args.where;
        const partnerId = args.where['partnerId'] as string;
        let rows = memberships.filter(m => m.partnerId === partnerId);
        if (args.where['isActive'] === true) {
          rows = rows.filter(m => m.isActive);
        }
        return [...rows].sort((a, b) => a.orgId.localeCompare(b.orgId));
      },
      async create(args: {
        data: { partnerId: string; orgId: string; cohortLabel: string | null };
      }) {
        const org = organizations.find(o => o.id === args.data.orgId);
        if (!org) throw new Error('missing org');
        const row: MockMembership = {
          id: `mem-${memberships.length + 1}`,
          partnerId: args.data.partnerId,
          orgId: args.data.orgId,
          cohortLabel: args.data.cohortLabel,
          isActive: true,
          org: {
            id: args.data.orgId,
            name: 'Linked Org',
            ein: '987654321',
            subscriptionTier: 'GROWTH',
            subscriptionStatus: 'ACTIVE',
          },
        };
        memberships.push(row);
        return { ...row, createdAt: new Date(), updatedAt: new Date() };
      },
      async findFirst(args: { where: { partnerId: string; orgId: string } }) {
        return (
          memberships.find(m => m.partnerId === args.where.partnerId && m.orgId === args.where.orgId) ?? null
        );
      },
      async update(args: {
        where: { id: string };
        data: { cohortLabel?: string | null; isActive?: boolean };
      }) {
        const row = memberships.find(m => m.id === args.where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, args.data);
        return { ...row, createdAt: new Date(), updatedAt: new Date() };
      },
    },
  };
});

vi.mock('@magnus/db/client', () => {
  const prisma = {
    organization: dbState.organization,
    partnerOrgMembership: dbState.partnerOrgMembership,
  };
  return { default: prisma, prisma };
});

describe('partner portfolio service', () => {
  beforeEach(() => {
    dbState.reset();
    govMock.mockResolvedValue({
      readiness: { complete: false, issueCount: 2, completionRate: 40 },
    });
    stateMock.mockResolvedValue({
      summary: {
        trackedStates: 2,
        solicitationStates: 2,
        activeStates: 1,
        pendingStates: 0,
        missingRegistrationStates: 0,
        overdueRenewals: 1,
        unknownStates: 0,
        highRiskStates: 0,
      },
    });
    auditMock.mockResolvedValue({
      summary: {
        overallStatus: 'in_progress',
        openItems: 4,
        blockedItems: 0,
        overdueItems: 1,
        totalItems: 6,
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    dbState.reset();
  });

  it('links a managed organization when the org exists', async () => {
    dbState.seedOrg(MANAGED_ORG);
    const row = await linkManagedOrganization(PARTNER_ID, { orgId: MANAGED_ORG, cohortLabel: 'Cohort A' });
    expect(row.orgId).toBe(MANAGED_ORG);
    expect(row.cohortLabel).toBe('Cohort A');
    expect(row.isActive).toBe(true);
  });

  it('throws when linking a missing organization', async () => {
    await expect(linkManagedOrganization(PARTNER_ID, { orgId: MANAGED_ORG })).rejects.toBeInstanceOf(
      PartnerPortfolioNotFoundError
    );
  });

  it('throws PARTNER_ORG_ALREADY_LINKED on unique violation', async () => {
    dbState.seedOrg(MANAGED_ORG);
    const spy = vi.spyOn(prisma.partnerOrgMembership, 'create').mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      })
    );
    await expect(linkManagedOrganization(PARTNER_ID, { orgId: MANAGED_ORG })).rejects.toMatchObject({
      message: 'PARTNER_ORG_ALREADY_LINKED',
    });
    spy.mockRestore();
  });

  it('updates cohort and active flag for an existing membership', async () => {
    dbState.seedOrg(MANAGED_ORG);
    dbState.seedMembership({
      id: 'm1',
      partnerId: PARTNER_ID,
      orgId: MANAGED_ORG,
      cohortLabel: 'Old',
      isActive: true,
    });
    const out = await updateManagedOrganization(PARTNER_ID, MANAGED_ORG, {
      cohortLabel: 'New',
      isActive: false,
    });
    expect(out.cohortLabel).toBe('New');
    expect(out.isActive).toBe(false);
  });

  it('throws when updating an unlinked organization', async () => {
    await expect(
      updateManagedOrganization(PARTNER_ID, MANAGED_ORG, { isActive: false })
    ).rejects.toBeInstanceOf(PartnerPortfolioNotFoundError);
  });

  it('filters inactive memberships for PARTNER_VIEWER', async () => {
    dbState.seedMembership({
      id: 'm1',
      partnerId: PARTNER_ID,
      orgId: MANAGED_ORG,
      cohortLabel: null,
      isActive: false,
    });
    const summary = await getPartnerPortfolioSummary(PARTNER_ID, {
      role: 'PARTNER_VIEWER',
      includeInactive: false,
    });
    expect(summary.organizations).toHaveLength(0);
    expect(dbState.lastFindManyWhere?.['isActive']).toBe(true);
  });

  it('includes inactive memberships for PARTNER_ADMIN when includeInactive is true', async () => {
    dbState.seedMembership({
      id: 'm1',
      partnerId: PARTNER_ID,
      orgId: MANAGED_ORG,
      cohortLabel: 'X',
      isActive: false,
    });
    const summary = await getPartnerPortfolioSummary(PARTNER_ID, {
      role: 'PARTNER_ADMIN',
      includeInactive: true,
    });
    expect(summary.organizations).toHaveLength(1);
    expect(dbState.lastFindManyWhere?.['isActive']).toBeUndefined();
  });

  it('aggregates governance, state registration, and audit prep snapshots per org', async () => {
    dbState.seedMembership({
      id: 'm1',
      partnerId: PARTNER_ID,
      orgId: MANAGED_ORG,
      cohortLabel: null,
      isActive: true,
    });
    const summary = await getPartnerPortfolioSummary(PARTNER_ID, {
      role: 'PARTNER_VIEWER',
      includeInactive: false,
    });
    expect(summary.disclaimer.length).toBeGreaterThan(20);
    expect(summary.organizations).toHaveLength(1);
    const o = summary.organizations[0]!;
    expect(o.governance.issueCount).toBe(2);
    expect(o.stateRegistrations.summary.overdueRenewals).toBe(1);
    expect(o.auditPrep.openItems).toBe(4);
    expect(govMock).toHaveBeenCalledWith(MANAGED_ORG);
    expect(stateMock).toHaveBeenCalledWith(MANAGED_ORG, expect.any(Date));
    expect(auditMock).toHaveBeenCalledWith(MANAGED_ORG, expect.any(Date));
  });

  it('parses link and update bodies', () => {
    expect(parseLinkManagedOrgBody({ orgId: '  ' + MANAGED_ORG + '  ', cohortLabel: ' A ' })).toEqual({
      orgId: MANAGED_ORG,
      cohortLabel: 'A',
    });
    expect(() => parseLinkManagedOrgBody({})).toThrow(PartnerPortfolioInputError);
    expect(parseUpdateManagedOrgBody({ isActive: false })).toEqual({ isActive: false });
    expect(() => parseUpdateManagedOrgBody({})).toThrow(PartnerPortfolioInputError);
  });
});
