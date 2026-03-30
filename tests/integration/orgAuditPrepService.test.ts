import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyAuditPrepTemplate,
  AUDIT_PREP_TEMPLATE_ITEMS,
  AuditPrepInputError,
  AuditPrepNotFoundError,
  getOrgAuditPrepSnapshot,
  parseAuditPrepItemPatch,
  updateOrgAuditPrepItem,
} from '../../apps/org-dashboard-api/src/orgAuditPrepService';

const ORG_ID = '77777777-7777-4777-8777-777777777777';

type MockAuditPrepItem = {
  id: string;
  orgId: string;
  templateItemKey: string;
  category: string;
  title: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'BLOCKED';
  targetDate: Date | null;
  assignee: string | null;
  notes: string | null;
  evidenceReference: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const dbState = vi.hoisted(() => {
  let items: MockAuditPrepItem[] = [];
  let counter = 0;

  return {
    reset() {
      items = [];
      counter = 0;
    },
    orgAuditPrepItem: {
      async findMany(args: { where: { orgId: string }; orderBy: Array<Record<string, string>> }) {
        const rows = items.filter(i => i.orgId === args.where.orgId);
        return [...rows].sort((a, b) => {
          if (a.category !== b.category) return a.category.localeCompare(b.category);
          return a.templateItemKey.localeCompare(b.templateItemKey);
        });
      },
      async createMany(args: {
        data: Array<{
          orgId: string;
          templateItemKey: string;
          category: string;
          title: string;
        }>;
        skipDuplicates?: boolean;
      }) {
        let count = 0;
        const fixedNow = new Date('2026-03-30T12:00:00.000Z');
        for (const row of args.data) {
          const exists = items.some(
            i => i.orgId === row.orgId && i.templateItemKey === row.templateItemKey
          );
          if (exists && args.skipDuplicates) continue;
          items.push({
            id: `audit-item-${++counter}`,
            orgId: row.orgId,
            templateItemKey: row.templateItemKey,
            category: row.category,
            title: row.title,
            status: 'NOT_STARTED',
            targetDate: null,
            assignee: null,
            notes: null,
            evidenceReference: null,
            createdAt: fixedNow,
            updatedAt: fixedNow,
          });
          count++;
        }
        return { count };
      },
      async findFirst(args: { where: { id: string; orgId: string } }) {
        return (
          items.find(i => i.id === args.where.id && i.orgId === args.where.orgId) ?? null
        );
      },
      async update(args: {
        where: { id: string };
        data: Partial<
          Pick<
            MockAuditPrepItem,
            'status' | 'targetDate' | 'assignee' | 'notes' | 'evidenceReference' | 'updatedAt'
          >
        >;
      }) {
        const row = items.find(i => i.id === args.where.id);
        if (!row) throw new Error('update_missing_row');
        Object.assign(row, args.data, { updatedAt: new Date('2026-03-30T12:00:00.000Z') });
        return row;
      },
    },
  };
});

vi.mock('@magnus/db/client', () => {
  const prisma = {
    orgAuditPrepItem: dbState.orgAuditPrepItem,
  };
  return {
    prisma,
    default: prisma,
  };
});

describe('org audit prep service', () => {
  beforeEach(() => {
    dbState.reset();
  });

  afterEach(() => {
    dbState.reset();
  });

  it('applies checklist template idempotently', async () => {
    const first = await applyAuditPrepTemplate(ORG_ID);
    expect(first.createdCount).toBe(AUDIT_PREP_TEMPLATE_ITEMS.length);

    const second = await applyAuditPrepTemplate(ORG_ID);
    expect(second.createdCount).toBe(0);

    const snapshot = await getOrgAuditPrepSnapshot(ORG_ID, new Date('2026-03-30T12:00:00.000Z'));
    expect(snapshot.items).toHaveLength(AUDIT_PREP_TEMPLATE_ITEMS.length);
    expect(snapshot.summary.totalItems).toBe(AUDIT_PREP_TEMPLATE_ITEMS.length);
    expect(snapshot.summary.overallStatus).toBe('in_progress');
    expect(snapshot.disclaimer.length).toBeGreaterThan(10);
  });

  it('updates item lifecycle and reflects readiness', async () => {
    await applyAuditPrepTemplate(ORG_ID);
    const snapshot0 = await getOrgAuditPrepSnapshot(ORG_ID, new Date('2026-03-30T12:00:00.000Z'));
    const firstId = snapshot0.items[0]!.id;

    await updateOrgAuditPrepItem(ORG_ID, firstId, { status: 'IN_PROGRESS' });
    const s1 = (await getOrgAuditPrepSnapshot(ORG_ID, new Date('2026-03-30T12:00:00.000Z'))).summary;
    expect(s1.openItems).toBe(AUDIT_PREP_TEMPLATE_ITEMS.length);

    for (const row of snapshot0.items) {
      await updateOrgAuditPrepItem(ORG_ID, row.id, { status: 'COMPLETE' });
    }
    const s2 = (await getOrgAuditPrepSnapshot(ORG_ID, new Date('2026-03-30T12:00:00.000Z'))).summary;
    expect(s2.overallStatus).toBe('all_complete');
    expect(s2.openItems).toBe(0);
  });

  it('flags blocked and overdue in summary', async () => {
    await applyAuditPrepTemplate(ORG_ID);
    const snapshot0 = await getOrgAuditPrepSnapshot(ORG_ID, new Date('2026-03-30T12:00:00.000Z'));
    const [a, b, ...rest] = snapshot0.items;

    await updateOrgAuditPrepItem(ORG_ID, a!.id, {
      status: 'BLOCKED',
      targetDate: new Date('2026-01-01T00:00:00.000Z'),
    });
    await updateOrgAuditPrepItem(ORG_ID, b!.id, {
      status: 'IN_PROGRESS',
      targetDate: new Date('2026-01-01T00:00:00.000Z'),
    });
    for (const row of rest) {
      await updateOrgAuditPrepItem(ORG_ID, row.id, { status: 'COMPLETE' });
    }

    const summary = (await getOrgAuditPrepSnapshot(ORG_ID, new Date('2026-03-30T12:00:00.000Z')))
      .summary;
    expect(summary.overallStatus).toBe('blocked');
    expect(summary.blockedItems).toBe(1);
    expect(summary.overdueItems).toBe(2);
  });

  it('raises not found for wrong org or missing item', async () => {
    await applyAuditPrepTemplate(ORG_ID);
    const snapshot0 = await getOrgAuditPrepSnapshot(ORG_ID, new Date('2026-03-30T12:00:00.000Z'));
    const id = snapshot0.items[0]!.id;

    await expect(
      updateOrgAuditPrepItem('88888888-8888-4888-8888-888888888888', id, { status: 'COMPLETE' })
    ).rejects.toBeInstanceOf(AuditPrepNotFoundError);

    await expect(
      updateOrgAuditPrepItem(ORG_ID, '00000000-0000-4000-8000-000000000000', { status: 'COMPLETE' })
    ).rejects.toBeInstanceOf(AuditPrepNotFoundError);
  });

  it('parseAuditPrepItemPatch validates input', () => {
    expect(() => parseAuditPrepItemPatch(null)).toThrow(AuditPrepInputError);
    expect(() => parseAuditPrepItemPatch({})).toThrow(AuditPrepInputError);
    expect(parseAuditPrepItemPatch({ status: 'IN_PROGRESS' })).toEqual({ status: 'IN_PROGRESS' });
    expect(parseAuditPrepItemPatch({ targetDate: null })).toEqual({ targetDate: null });
    expect(() => parseAuditPrepItemPatch({ status: 'DONE' })).toThrow(AuditPrepInputError);
  });
});
