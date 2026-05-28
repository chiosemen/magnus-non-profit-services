import test from 'node:test';
import assert from 'node:assert/strict';
import {
  archiveCampaign,
  createCampaign,
  getCampaignById,
  listCampaigns,
  publishCampaign,
  updateCampaign,
} from '../campaignService';

type CampaignRow = {
  id: string;
  orgId: string;
  title: string;
  slug: string;
  description: string | null;
  status: 'DRAFT' | 'LIVE' | 'ARCHIVED';
  goalAmount: { toString(): string } | null;
  currency: string;
  startsAt: Date | null;
  endsAt: Date | null;
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function decimal(value: string): { toString(): string } {
  return { toString: () => value };
}

function createDb(seed: {
  campaigns?: CampaignRow[];
  stripeStatusByOrg?: Record<string, 'NOT_STARTED' | 'LINK_CREATED' | 'IN_PROGRESS' | 'ENABLED' | 'RESTRICTED'>;
} = {}) {
  let sequence = 0;
  const rows = new Map((seed.campaigns ?? []).map(item => [item.id, { ...item }]));
  const stripeStatusByOrg = new Map(Object.entries(seed.stripeStatusByOrg ?? {}));

  return {
    campaign: {
      findMany: async ({ where }: any) => {
        return [...rows.values()].filter(item => item.orgId === where.orgId);
      },
      findFirst: async ({ where }: any) => {
        const byId = where.id ? rows.get(where.id) : null;
        if (byId) return byId.orgId === where.orgId ? { ...byId } : null;
        const first = [...rows.values()].find(item => item.orgId === where.orgId);
        return first ? { ...first } : null;
      },
      create: async ({ data }: any) => {
        const duplicate = [...rows.values()].find(item => item.orgId === data.orgId && item.slug === data.slug);
        if (duplicate) {
          const err: any = new Error('duplicate');
          err.code = 'P2002';
          err.name = 'PrismaClientKnownRequestError';
          throw err;
        }

        sequence += 1;
        const now = new Date(`2026-05-28T20:${String(sequence).padStart(2, '0')}:00.000Z`);
        const row: CampaignRow = {
          id: `campaign_${sequence}`,
          orgId: data.orgId,
          title: data.title,
          slug: data.slug,
          description: data.description ?? null,
          status: data.status ?? 'DRAFT',
          goalAmount: data.goalAmount ? decimal(data.goalAmount) : null,
          currency: data.currency,
          startsAt: data.startsAt ?? null,
          endsAt: data.endsAt ?? null,
          publishedAt: data.publishedAt ?? null,
          archivedAt: data.archivedAt ?? null,
          createdAt: now,
          updatedAt: now,
        };
        rows.set(row.id, row);
        return { ...row };
      },
      update: async ({ where, data }: any) => {
        const current = rows.get(where.id);
        if (!current) throw new Error('not found');

        if (data.slug) {
          const duplicate = [...rows.values()].find(item => item.id !== current.id && item.orgId === current.orgId && item.slug === data.slug);
          if (duplicate) {
            const err: any = new Error('duplicate');
            err.code = 'P2002';
            err.name = 'PrismaClientKnownRequestError';
            throw err;
          }
        }

        const updated: CampaignRow = {
          ...current,
          ...data,
          goalAmount: data.goalAmount === null
            ? null
            : data.goalAmount !== undefined
              ? decimal(String(data.goalAmount))
              : current.goalAmount,
          updatedAt: new Date('2026-05-29T00:00:00.000Z'),
        };
        rows.set(updated.id, updated);
        return { ...updated };
      },
    },
    stripeConnectAccount: {
      findUnique: async ({ where }: any) => {
        const status = stripeStatusByOrg.get(where.orgId);
        if (!status) return null;
        return { onboardingStatus: status };
      },
    },
    _rows: rows,
  };
}

test('create/list/update campaign keep org scoping and mutable fields', async () => {
  const db = createDb();

  const created = await createCampaign(db as any, 'org_1', {
    title: 'Summer Appeal',
    description: 'Campaign details',
    goalAmount: 2500,
    currency: 'usd',
  });

  assert.equal(created.orgId, 'org_1');
  assert.equal(created.slug, 'summer-appeal');
  assert.equal(created.currency, 'USD');

  const listed = await listCampaigns(db as any, 'org_1');
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, created.id);

  const updated = await updateCampaign(db as any, 'org_1', created.id, {
    title: 'Summer Appeal 2026',
    slug: 'summer-appeal-2026',
    description: 'Updated body',
    goalAmount: 5000,
  });

  assert.equal(updated.title, 'Summer Appeal 2026');
  assert.equal(updated.slug, 'summer-appeal-2026');
  assert.equal(updated.goalAmount, '5000.00');
});

test('slug uniqueness is enforced per organization', async () => {
  const db = createDb();

  await createCampaign(db as any, 'org_1', { title: 'Alpha', slug: 'shared' });
  await createCampaign(db as any, 'org_2', { title: 'Beta', slug: 'shared' });

  await assert.rejects(
    () => createCampaign(db as any, 'org_1', { title: 'Gamma', slug: 'shared' }),
    /CAMPAIGN_SLUG_DUPLICATE/,
  );
});

test('campaign lookup is org isolated', async () => {
  const db = createDb({
    campaigns: [
      {
        id: 'campaign_1',
        orgId: 'org_1',
        title: 'Org One',
        slug: 'org-one',
        description: null,
        status: 'DRAFT',
        goalAmount: null,
        currency: 'USD',
        startsAt: null,
        endsAt: null,
        publishedAt: null,
        archivedAt: null,
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    ],
  });

  await assert.rejects(
    () => getCampaignById(db as any, 'org_2', 'campaign_1'),
    /CAMPAIGN_NOT_FOUND/,
  );
});

test('publish is blocked unless Stripe Connect is ENABLED', async () => {
  const db = createDb({
    campaigns: [
      {
        id: 'campaign_1',
        orgId: 'org_1',
        title: 'Draft',
        slug: 'draft',
        description: null,
        status: 'DRAFT',
        goalAmount: null,
        currency: 'USD',
        startsAt: null,
        endsAt: null,
        publishedAt: null,
        archivedAt: null,
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    ],
    stripeStatusByOrg: {
      org_1: 'IN_PROGRESS',
    },
  });

  await assert.rejects(
    () => publishCampaign(db as any, 'org_1', 'campaign_1'),
    /STRIPE_CONNECT_NOT_ENABLED/,
  );
});

test('publish succeeds when Stripe Connect is ENABLED and archive blocks republish', async () => {
  const db = createDb({
    campaigns: [
      {
        id: 'campaign_1',
        orgId: 'org_1',
        title: 'Draft',
        slug: 'draft',
        description: null,
        status: 'DRAFT',
        goalAmount: null,
        currency: 'USD',
        startsAt: null,
        endsAt: null,
        publishedAt: null,
        archivedAt: null,
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      },
    ],
    stripeStatusByOrg: {
      org_1: 'ENABLED',
    },
  });

  const live = await publishCampaign(db as any, 'org_1', 'campaign_1');
  assert.equal(live.status, 'LIVE');
  assert.ok(live.publishedAt);

  const archived = await archiveCampaign(db as any, 'org_1', 'campaign_1');
  assert.equal(archived.status, 'ARCHIVED');
  assert.ok(archived.archivedAt);

  await assert.rejects(
    () => publishCampaign(db as any, 'org_1', 'campaign_1'),
    /CAMPAIGN_ARCHIVED_NOT_PUBLISHABLE/,
  );
});
