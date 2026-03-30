import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@magnus/db/types';
import prisma from '@magnus/db/client';
import {
  getPartnerPortfolioSummary,
  linkManagedOrganization,
  parseLinkManagedOrgBody,
  parsePartnerPortfolioListFiltersFromQuery,
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
  partnerNotes: string | null;
  partnerTags: string[];
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
      memberships.push({
        partnerNotes: null,
        partnerTags: [],
        ...row,
        org,
      });
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
        if (args.where['isActive'] === false) {
          rows = rows.filter(m => !m.isActive);
        }
        const cohort = args.where['cohortLabel'];
        if (typeof cohort === 'string') {
          rows = rows.filter(m => m.cohortLabel === cohort);
        }
        const orgWhere = args.where['org'] as { subscriptionStatus?: string } | undefined;
        if (orgWhere?.subscriptionStatus) {
          rows = rows.filter(m => m.org.subscriptionStatus === orgWhere.subscriptionStatus);
        }
        return [...rows].sort((a, b) => a.orgId.localeCompare(b.orgId));
      },
      async create(args: {
        data: {
          partnerId?: string;
          orgId?: string;
          partner?: { connect: { id: string } };
          org?: { connect: { id: string } };
          cohortLabel: string | null;
          partnerNotes?: string | null;
          partnerTags?: string[];
        };
      }) {
        const partnerId = args.data.partnerId ?? args.data.partner?.connect.id;
        const orgId = args.data.orgId ?? args.data.org?.connect.id;
        if (!partnerId || !orgId) throw new Error('missing ids');
        const org = organizations.find(o => o.id === orgId);
        if (!org) throw new Error('missing org');
        const row: MockMembership = {
          id: `mem-${memberships.length + 1}`,
          partnerId,
          orgId,
          cohortLabel: args.data.cohortLabel,
          isActive: true,
          partnerNotes: args.data.partnerNotes ?? null,
          partnerTags: args.data.partnerTags ?? [],
          org: {
            id: orgId,
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
        data: {
          cohortLabel?: string | null;
          isActive?: boolean;
          partnerNotes?: string | null;
          partnerTags?: { set: string[] };
        };
      }) {
        const row = memberships.find(m => m.id === args.where.id);
        if (!row) throw new Error('not found');
        const d = args.data;
        if (Object.prototype.hasOwnProperty.call(d, 'cohortLabel')) row.cohortLabel = d.cohortLabel ?? null;
        if (typeof d.isActive === 'boolean') row.isActive = d.isActive;
        if (Object.prototype.hasOwnProperty.call(d, 'partnerNotes')) row.partnerNotes = d.partnerNotes ?? null;
        if (d.partnerTags?.set) row.partnerTags = [...d.partnerTags.set];
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
    expect(row.partnerNotes).toBeNull();
    expect(row.partnerTags).toEqual([]);
  });

  it('links with optional partner notes and tags', async () => {
    dbState.seedOrg(MANAGED_ORG);
    const row = await linkManagedOrganization(PARTNER_ID, {
      orgId: MANAGED_ORG,
      partnerNotes: ' hello ',
      partnerTags: ['a', ' b ', 'a'],
    });
    expect(row.partnerNotes).toBe('hello');
    expect(row.partnerTags).toEqual(['a', 'b']);
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

  it('updates cohort, active flag, notes, and tags for an existing membership', async () => {
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
      partnerNotes: 'note',
      partnerTags: ['x'],
    });
    expect(out.cohortLabel).toBe('New');
    expect(out.isActive).toBe(false);
    expect(out.partnerNotes).toBe('note');
    expect(out.partnerTags).toEqual(['x']);
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
    expect(summary.resultCount).toBe(0);
    expect(summary.filtersApplied).toEqual({});
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

  it('aggregates governance, state registration, and audit prep snapshots per org with stable row contract', async () => {
    dbState.seedMembership({
      id: 'm1',
      partnerId: PARTNER_ID,
      orgId: MANAGED_ORG,
      cohortLabel: 'C1',
      isActive: true,
      partnerNotes: 'n1',
      partnerTags: ['t1'],
    });
    const summary = await getPartnerPortfolioSummary(PARTNER_ID, {
      role: 'PARTNER_VIEWER',
      includeInactive: false,
    });
    expect(summary.disclaimer.length).toBeGreaterThan(20);
    expect(summary.organizations).toHaveLength(1);
    expect(summary.resultCount).toBe(1);
    const o = summary.organizations[0]!;
    expect(o).toMatchObject({
      membershipId: 'm1',
      orgId: MANAGED_ORG,
      cohortLabel: 'C1',
      isActive: true,
      partnerNotes: 'n1',
      partnerTags: ['t1'],
    });
    expect(Object.keys(o).sort()).toEqual(
      [
        'auditPrep',
        'cohortLabel',
        'ein',
        'governance',
        'isActive',
        'membershipId',
        'name',
        'orgId',
        'partnerNotes',
        'partnerTags',
        'stateRegistrations',
        'subscriptionStatus',
        'subscriptionTier',
      ].sort()
    );
    expect(o.governance.issueCount).toBe(2);
    expect(o.stateRegistrations.summary.overdueRenewals).toBe(1);
    expect(o.auditPrep.openItems).toBe(4);
    expect(govMock).toHaveBeenCalledWith(MANAGED_ORG);
    expect(stateMock).toHaveBeenCalledWith(MANAGED_ORG, expect.any(Date));
    expect(auditMock).toHaveBeenCalledWith(MANAGED_ORG, expect.any(Date));
  });

  it('applies DB filters for cohort and subscription status', async () => {
    dbState.seedMembership({
      id: 'm1',
      partnerId: PARTNER_ID,
      orgId: MANAGED_ORG,
      cohortLabel: 'A',
      isActive: true,
      org: {
        id: MANAGED_ORG,
        name: 'O1',
        ein: '1',
        subscriptionTier: 'STARTER',
        subscriptionStatus: 'ACTIVE',
      },
    });
    const otherOrg = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    dbState.seedOrg(otherOrg);
    dbState.seedMembership({
      id: 'm2',
      partnerId: PARTNER_ID,
      orgId: otherOrg,
      cohortLabel: 'B',
      isActive: true,
      org: {
        id: otherOrg,
        name: 'O2',
        ein: '2',
        subscriptionTier: 'STARTER',
        subscriptionStatus: 'PAST_DUE',
      },
    });
    const summary = await getPartnerPortfolioSummary(PARTNER_ID, {
      role: 'PARTNER_ADMIN',
      includeInactive: true,
      filters: { cohortLabel: 'A', subscriptionStatus: 'ACTIVE' },
    });
    expect(summary.organizations).toHaveLength(1);
    expect(summary.organizations[0]!.orgId).toBe(MANAGED_ORG);
    expect(summary.filtersApplied.cohortLabel).toBe('A');
    expect(summary.filtersApplied.subscriptionStatus).toBe('ACTIVE');
  });

  it('applies in-memory filter for auditPrepOverallStatus', async () => {
    dbState.seedMembership({
      id: 'm1',
      partnerId: PARTNER_ID,
      orgId: MANAGED_ORG,
      cohortLabel: null,
      isActive: true,
    });
    auditMock.mockResolvedValue({
      summary: {
        overallStatus: 'blocked',
        openItems: 1,
        blockedItems: 1,
        overdueItems: 0,
        totalItems: 2,
      },
    });
    const match = await getPartnerPortfolioSummary(PARTNER_ID, {
      role: 'PARTNER_VIEWER',
      includeInactive: false,
      filters: { auditPrepOverallStatus: 'blocked' },
    });
    expect(match.organizations).toHaveLength(1);

    const noMatch = await getPartnerPortfolioSummary(PARTNER_ID, {
      role: 'PARTNER_VIEWER',
      includeInactive: false,
      filters: { auditPrepOverallStatus: 'all_complete' },
    });
    expect(noMatch.organizations).toHaveLength(0);
  });

  it('VIEWER ignores isActive=false filter in applied echo and DB still restricts to active rows', async () => {
    dbState.seedMembership({
      id: 'm1',
      partnerId: PARTNER_ID,
      orgId: MANAGED_ORG,
      cohortLabel: null,
      isActive: false,
    });
    const summary = await getPartnerPortfolioSummary(PARTNER_ID, {
      role: 'PARTNER_VIEWER',
      includeInactive: true,
      filters: { isActive: false },
    });
    expect(summary.organizations).toHaveLength(0);
    expect(summary.filtersApplied.isActive).toBeUndefined();
    expect(dbState.lastFindManyWhere?.['isActive']).toBe(true);
  });

  it('parses list filters from query record', () => {
    expect(
      parsePartnerPortfolioListFiltersFromQuery({
        isActive: 'false',
        cohortLabel: 'c1',
        subscriptionStatus: 'ACTIVE',
        auditPrepOverallStatus: 'in_progress',
        governanceComplete: 'true',
        stateRegHasOverdueRenewal: 'false',
      })
    ).toEqual({
      isActive: false,
      cohortLabel: 'c1',
      subscriptionStatus: 'ACTIVE',
      auditPrepOverallStatus: 'in_progress',
      governanceComplete: true,
      stateRegHasOverdueRenewal: false,
    });
    expect(() =>
      parsePartnerPortfolioListFiltersFromQuery({ subscriptionStatus: 'INVALID' })
    ).toThrow(PartnerPortfolioInputError);
  });

  it('parses link and update bodies', () => {
    expect(parseLinkManagedOrgBody({ orgId: '  ' + MANAGED_ORG + '  ', cohortLabel: ' A ' })).toEqual({
      orgId: MANAGED_ORG,
      cohortLabel: 'A',
    });
    expect(() => parseLinkManagedOrgBody({})).toThrow(PartnerPortfolioInputError);
    expect(parseUpdateManagedOrgBody({ isActive: false })).toEqual({ isActive: false });
    expect(() => parseUpdateManagedOrgBody({})).toThrow(PartnerPortfolioInputError);
    expect(parseUpdateManagedOrgBody({ partnerNotes: null })).toEqual({ partnerNotes: null });
    expect(parseUpdateManagedOrgBody({ partnerTags: ['a'] })).toEqual({ partnerTags: ['a'] });
  });

  it('rejects oversized partner notes and too many tags on update parse', () => {
    expect(() =>
      parseUpdateManagedOrgBody({ partnerNotes: 'x'.repeat(4001) })
    ).toThrow(PartnerPortfolioInputError);
    expect(() =>
      parseUpdateManagedOrgBody({ partnerTags: Array.from({ length: 21 }, (_, i) => `t${i}`) })
    ).toThrow(PartnerPortfolioInputError);
  });
});
