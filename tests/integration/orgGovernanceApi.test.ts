import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBoardGovernanceMember,
  deleteBoardGovernanceMember,
  getOrgGovernanceSnapshot,
  upsertGovernancePolicies,
  updateBoardGovernanceMember,
} from '../../apps/org-dashboard-api/src/orgGovernanceService';

const ORG_ID = '55555555-5555-4555-8555-555555555555';
const ORG_EIN = '123450002';

type MockOrganization = {
  id: string;
  ein: string;
  name: string;
  subscriptionTier: 'STARTER' | 'GROWTH' | 'ENTERPRISE';
  subscriptionStatus: 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
};

type MockGovernanceProfile = {
  id: string;
  orgId: string;
  conflictOfInterestPolicy: boolean;
  whistleblowerPolicy: boolean;
  documentRetentionPolicy: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type MockBoardGovernanceMember = {
  id: string;
  orgId: string;
  name: string;
  officerRole: 'CHAIR' | 'VICE_CHAIR' | 'TREASURER' | 'SECRETARY' | 'PRESIDENT' | 'MEMBER_AT_LARGE' | 'OTHER' | null;
  termStart: Date | null;
  termEnd: Date | null;
  conflictDisclosureSignedAt: Date | null;
  meetingsHeld: number | null;
  meetingsAttended: number | null;
  createdAt: Date;
  updatedAt: Date;
};

const dbState = vi.hoisted(() => {
  let organizations: MockOrganization[] = [];
  let profiles: MockGovernanceProfile[] = [];
  let members: MockBoardGovernanceMember[] = [];
  let memberCounter = 0;
  let profileCounter = 0;

  return {
    reset() {
      organizations = [];
      profiles = [];
      members = [];
      memberCounter = 0;
      profileCounter = 0;
    },
    seedOrganization(org: MockOrganization) {
      organizations.push(org);
    },
    seedProfile(profile: Omit<MockGovernanceProfile, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<MockGovernanceProfile, 'id' | 'createdAt' | 'updatedAt'>>) {
      profiles.push({
        id: profile.id ?? `profile-${++profileCounter}`,
        createdAt: profile.createdAt ?? new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: profile.updatedAt ?? new Date('2025-01-01T00:00:00.000Z'),
        ...profile,
      });
    },
    seedMember(member: Omit<MockBoardGovernanceMember, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<MockBoardGovernanceMember, 'id' | 'createdAt' | 'updatedAt'>>) {
      members.push({
        id: member.id ?? `member-${++memberCounter}`,
        createdAt: member.createdAt ?? new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: member.updatedAt ?? new Date('2025-01-01T00:00:00.000Z'),
        ...member,
      });
    },
    organization: {
      async findUnique(args: { where: { id?: string }; select?: Record<string, boolean> }) {
        const org = organizations.find(candidate => candidate.id === args.where.id);
        if (!org) return null;
        if (!args.select) return org;
        return Object.fromEntries(
          Object.keys(args.select)
            .filter(key => args.select?.[key])
            .map(key => [key, (org as Record<string, unknown>)[key]])
        );
      },
    },
    governanceProfile: {
      async findUnique(args: { where: { orgId: string } }) {
        return profiles.find(profile => profile.orgId === args.where.orgId) ?? null;
      },
      async upsert(args: {
        where: { orgId: string };
        create: Omit<MockGovernanceProfile, 'id' | 'createdAt' | 'updatedAt'>;
        update: Partial<Omit<MockGovernanceProfile, 'id' | 'orgId' | 'createdAt' | 'updatedAt'>>;
      }) {
        const existing = profiles.find(profile => profile.orgId === args.where.orgId);
        if (existing) {
          Object.assign(existing, args.update, { updatedAt: new Date('2025-03-29T00:00:00.000Z') });
          return existing;
        }
        const created: MockGovernanceProfile = {
          id: `profile-${++profileCounter}`,
          createdAt: new Date('2025-03-29T00:00:00.000Z'),
          updatedAt: new Date('2025-03-29T00:00:00.000Z'),
          ...args.create,
        };
        profiles.push(created);
        return created;
      },
    },
    boardGovernanceMember: {
      async findMany(args: { where: { orgId: string } }) {
        return [...members]
          .filter(member => member.orgId === args.where.orgId)
          .sort((left, right) => left.name.localeCompare(right.name));
      },
      async create(args: { data: Omit<MockBoardGovernanceMember, 'id' | 'createdAt' | 'updatedAt'> }) {
        const created: MockBoardGovernanceMember = {
          id: `member-${++memberCounter}`,
          createdAt: new Date('2025-03-29T00:00:00.000Z'),
          updatedAt: new Date('2025-03-29T00:00:00.000Z'),
          ...args.data,
        };
        members.push(created);
        return created;
      },
      async findFirst(args: { where: { id: string; orgId: string } }) {
        return members.find(member => member.id === args.where.id && member.orgId === args.where.orgId) ?? null;
      },
      async update(args: { where: { id: string }; data: Partial<Omit<MockBoardGovernanceMember, 'id' | 'orgId' | 'createdAt' | 'updatedAt'>> }) {
        const existing = members.find(member => member.id === args.where.id);
        if (!existing) throw new Error('member_not_found');
        Object.assign(existing, args.data, { updatedAt: new Date('2025-03-29T00:00:00.000Z') });
        return existing;
      },
      async deleteMany(args: { where: { id: string; orgId: string } }) {
        const before = members.length;
        members = members.filter(member => !(member.id === args.where.id && member.orgId === args.where.orgId));
        return { count: before - members.length };
      },
    },
  };
});

vi.mock('@magnus/db/client', () => {
  const prisma = {
    organization: dbState.organization,
    governanceProfile: dbState.governanceProfile,
    boardGovernanceMember: dbState.boardGovernanceMember,
  };

  return {
    prisma,
    default: prisma,
  };
});

describe('org governance service integration', () => {
  beforeEach(() => {
    dbState.reset();
    dbState.seedOrganization({
      id: ORG_ID,
      ein: ORG_EIN,
      name: 'Governance Test Org',
      subscriptionTier: 'ENTERPRISE',
      subscriptionStatus: 'ACTIVE',
    });
  });

  afterEach(() => {
    dbState.reset();
  });

  it('returns missing governance items when no data exists', async () => {
    const snapshot = await getOrgGovernanceSnapshot(ORG_ID, new Date('2026-03-29T00:00:00.000Z'));

    expect(snapshot).toMatchObject({
      orgId: ORG_ID,
      boardMembers: [],
      readiness: {
        complete: false,
      },
    });
    expect(snapshot.readiness.issues.map(issue => issue.code)).toEqual([
      'BOARD_ROSTER_EMPTY',
      'OFFICER_ROLE_MISSING',
      'POLICY_MISSING',
      'POLICY_MISSING',
      'POLICY_MISSING',
    ]);
  });

  it('supports governance policy updates plus board member create, update, and delete flows', async () => {
    const policyChecklist = await upsertGovernancePolicies(ORG_ID, {
      conflictOfInterestPolicy: true,
      whistleblowerPolicy: true,
      documentRetentionPolicy: false,
    });

    expect(policyChecklist).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'conflictOfInterestPolicy', enabled: true }),
      expect.objectContaining({ key: 'documentRetentionPolicy', enabled: false }),
    ]));

    const createdMember = await createBoardGovernanceMember(ORG_ID, {
      name: 'Alex Chair',
      officerRole: 'CHAIR',
      termStart: new Date('2025-01-01T00:00:00.000Z'),
      termEnd: new Date('2026-12-31T00:00:00.000Z'),
      conflictDisclosureSignedAt: new Date('2020-02-15T00:00:00.000Z'),
      meetingsHeld: 6,
      meetingsAttended: 5,
    });

    expect(createdMember).toMatchObject({
      name: 'Alex Chair',
      officerRole: 'CHAIR',
    });

    const patchedMember = await updateBoardGovernanceMember(ORG_ID, createdMember.id, {
      meetingsHeld: 8,
      meetingsAttended: 8,
    });

    expect(patchedMember.attendanceSummary).toMatchObject({
      meetingsHeld: 8,
      meetingsAttended: 8,
      attendanceRate: 100,
    });

    const snapshot = await getOrgGovernanceSnapshot(ORG_ID, new Date('2026-03-29T00:00:00.000Z'));

    expect(snapshot.boardMembers).toHaveLength(1);
    expect(snapshot.readiness.issues.map(issue => issue.code)).toEqual([
      'POLICY_MISSING',
      'CONFLICT_DISCLOSURE_STALE',
    ]);

    await deleteBoardGovernanceMember(ORG_ID, createdMember.id);
    const afterDelete = await getOrgGovernanceSnapshot(ORG_ID, new Date('2026-03-29T00:00:00.000Z'));

    expect(afterDelete.readiness.issues.map(issue => issue.code)).toEqual([
      'BOARD_ROSTER_EMPTY',
      'OFFICER_ROLE_MISSING',
      'POLICY_MISSING',
    ]);
  });

  it('includes seeded governance records in the readiness snapshot', async () => {
    dbState.seedProfile({
      orgId: ORG_ID,
      conflictOfInterestPolicy: true,
      whistleblowerPolicy: true,
      documentRetentionPolicy: true,
    });
    dbState.seedMember({
      orgId: ORG_ID,
      name: 'Jordan Treasurer',
      officerRole: 'TREASURER',
      termStart: new Date('2025-01-01T00:00:00.000Z'),
      termEnd: new Date('2027-12-31T00:00:00.000Z'),
      conflictDisclosureSignedAt: new Date('2020-01-15T00:00:00.000Z'),
      meetingsHeld: 4,
      meetingsAttended: 4,
    });

    const snapshot = await getOrgGovernanceSnapshot(ORG_ID, new Date('2026-03-29T00:00:00.000Z'));

    expect(snapshot.readiness).toMatchObject({
      complete: false,
    });
    expect(snapshot.readiness.issues.map(issue => issue.code)).toEqual([
      'CONFLICT_DISCLOSURE_STALE',
    ]);
  });
});
