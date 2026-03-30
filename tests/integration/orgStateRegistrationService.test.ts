import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteOrgStateRegistration,
  getOrgStateRegistrationSnapshot,
  StateRegistrationNotFoundError,
  upsertOrgStateRegistration,
} from '../../apps/org-dashboard-api/src/orgStateRegistrationService';

const ORG_ID = '66666666-6666-4666-8666-666666666666';

type MockOrgStateRegistration = {
  id: string;
  orgId: string;
  stateCode: string;
  status: 'ACTIVE' | 'PENDING' | 'NOT_REGISTERED' | 'UNKNOWN';
  solicitsDonations: boolean;
  renewalDueDate: Date | null;
  renewalNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const dbState = vi.hoisted(() => {
  let registrations: MockOrgStateRegistration[] = [];
  let counter = 0;

  return {
    reset() {
      registrations = [];
      counter = 0;
    },
    seed(row: Omit<MockOrgStateRegistration, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<MockOrgStateRegistration, 'id' | 'createdAt' | 'updatedAt'>>) {
      registrations.push({
        id: row.id ?? `state-${++counter}`,
        createdAt: row.createdAt ?? new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: row.updatedAt ?? new Date('2026-03-01T00:00:00.000Z'),
        ...row,
      });
    },
    orgStateRegistration: {
      async findMany(args: { where: { orgId: string } }) {
        return [...registrations]
          .filter(row => row.orgId === args.where.orgId)
          .sort((left, right) => left.stateCode.localeCompare(right.stateCode));
      },
      async upsert(args: {
        where: { orgId_stateCode: { orgId: string; stateCode: string } };
        create: Omit<MockOrgStateRegistration, 'id' | 'createdAt' | 'updatedAt'>;
        update: Partial<Omit<MockOrgStateRegistration, 'id' | 'orgId' | 'stateCode' | 'createdAt' | 'updatedAt'>>;
      }) {
        const existing = registrations.find(row => (
          row.orgId === args.where.orgId_stateCode.orgId &&
          row.stateCode === args.where.orgId_stateCode.stateCode
        ));
        if (existing) {
          Object.assign(existing, args.update, { updatedAt: new Date('2026-03-29T00:00:00.000Z') });
          return existing;
        }
        const created: MockOrgStateRegistration = {
          id: `state-${++counter}`,
          createdAt: new Date('2026-03-29T00:00:00.000Z'),
          updatedAt: new Date('2026-03-29T00:00:00.000Z'),
          ...args.create,
        };
        registrations.push(created);
        return created;
      },
      async deleteMany(args: { where: { orgId: string; stateCode: string } }) {
        const before = registrations.length;
        registrations = registrations.filter(row => !(row.orgId === args.where.orgId && row.stateCode === args.where.stateCode));
        return { count: before - registrations.length };
      },
    },
  };
});

vi.mock('@magnus/db/client', () => {
  const prisma = {
    orgStateRegistration: dbState.orgStateRegistration,
  };
  return {
    prisma,
    default: prisma,
  };
});

describe('org state registration service', () => {
  beforeEach(() => {
    dbState.reset();
  });

  afterEach(() => {
    dbState.reset();
  });

  it('tracks user-entered state registrations and computes summary risk flags', async () => {
    await upsertOrgStateRegistration(ORG_ID, 'CA', {
      status: 'NOT_REGISTERED',
      solicitsDonations: true,
      renewalNotes: 'Board approved CA fundraising launch.',
    });
    await upsertOrgStateRegistration(ORG_ID, 'NY', {
      status: 'ACTIVE',
      solicitsDonations: true,
      renewalDueDate: new Date('2026-02-01T00:00:00.000Z'),
      renewalNotes: 'Annual CHAR500 package pending.',
    });
    await upsertOrgStateRegistration(ORG_ID, 'IL', {
      status: 'UNKNOWN',
      solicitsDonations: true,
      renewalNotes: null,
    });

    const snapshot = await getOrgStateRegistrationSnapshot(ORG_ID, new Date('2026-03-29T00:00:00.000Z'));

    expect(snapshot.summary).toMatchObject({
      trackedStates: 3,
      missingRegistrationStates: 1,
      overdueRenewals: 1,
      unknownStates: 1,
    });
    expect(snapshot.registrations.map(item => item.stateCode)).toEqual(['CA', 'IL', 'NY']);
    expect(snapshot.registrations[0]?.riskFlags.map(flag => flag.code)).toEqual(['MISSING_REGISTRATION']);
    expect(snapshot.registrations[1]?.riskFlags.map(flag => flag.code)).toEqual(['UNKNOWN_STATUS']);
    expect(snapshot.registrations[2]?.riskFlags.map(flag => flag.code)).toEqual(['OVERDUE_RENEWAL']);
  });

  it('updates and deletes tracked states deterministically', async () => {
    const created = await upsertOrgStateRegistration(ORG_ID, 'CA', {
      status: 'PENDING',
      solicitsDonations: true,
      renewalNotes: 'Initial filing in progress.',
    });

    expect(created.trackedStatus).toBe('pending');

    const updated = await upsertOrgStateRegistration(ORG_ID, 'CA', {
      status: 'ACTIVE',
      solicitsDonations: true,
      renewalDueDate: new Date('2026-12-31T00:00:00.000Z'),
      renewalNotes: 'Approved and filed.',
    });

    expect(updated.trackedStatus).toBe('active');
    expect(updated.userEntered.renewalDueDate).toBe('2026-12-31');

    await deleteOrgStateRegistration(ORG_ID, 'CA');
    const afterDelete = await getOrgStateRegistrationSnapshot(ORG_ID, new Date('2026-03-29T00:00:00.000Z'));
    expect(afterDelete.registrations).toHaveLength(0);
  });

  it('raises not found when deleting an untracked state', async () => {
    await expect(deleteOrgStateRegistration(ORG_ID, 'CA')).rejects.toBeInstanceOf(StateRegistrationNotFoundError);
  });
});
