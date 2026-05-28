import test from 'node:test';
import assert from 'node:assert/strict';
import { registerCampaignRoutes } from '../campaignRoutes';

type Handler = (req: any, res: any, next: (err?: unknown) => void) => Promise<any>;

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

function createHarness() {
  const handlers = new Map<string, Handler>();
  const app: any = {
    get: (path: string, _auth: any, handler: Handler) => handlers.set(`GET ${path}`, handler),
    post: (path: string, _auth: any, handler: Handler) => handlers.set(`POST ${path}`, handler),
    patch: (path: string, _auth: any, handler: Handler) => handlers.set(`PATCH ${path}`, handler),
  };

  function response() {
    const res: any = {
      statusCode: 200,
      body: null as any,
      status(code: number) {
        res.statusCode = code;
        return res;
      },
      json(payload: any) {
        res.body = payload;
        return res;
      },
    };
    return res;
  }

  return { app, handlers, response };
}

function createDb(seed?: { campaigns?: CampaignRow[]; stripeStatus?: Record<string, string> }) {
  const rows = new Map((seed?.campaigns ?? []).map(item => [item.id, { ...item }]));
  const stripeStatus = new Map(Object.entries(seed?.stripeStatus ?? {}));
  let seq = 0;

  return {
    campaign: {
      findMany: async ({ where }: any) => [...rows.values()].filter(item => item.orgId === where.orgId),
      findFirst: async ({ where }: any) => {
        const row = rows.get(where.id);
        if (!row) return null;
        return row.orgId === where.orgId ? { ...row } : null;
      },
      create: async ({ data }: any) => {
        const dupe = [...rows.values()].find(item => item.orgId === data.orgId && item.slug === data.slug);
        if (dupe) {
          const err: any = new Error('duplicate');
          err.code = 'P2002';
          throw err;
        }
        seq += 1;
        const now = new Date('2026-05-28T00:00:00.000Z');
        const row: CampaignRow = {
          id: `campaign_${seq}`,
          orgId: data.orgId,
          title: data.title,
          slug: data.slug,
          description: data.description ?? null,
          status: data.status ?? 'DRAFT',
          goalAmount: data.goalAmount ? decimal(String(data.goalAmount)) : null,
          currency: data.currency ?? 'USD',
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
        const row = rows.get(where.id);
        if (!row) throw new Error('not_found');
        const next: CampaignRow = {
          ...row,
          ...data,
          goalAmount: data.goalAmount === null
            ? null
            : data.goalAmount !== undefined
              ? decimal(String(data.goalAmount))
              : row.goalAmount,
          updatedAt: new Date('2026-05-29T00:00:00.000Z'),
        };
        rows.set(next.id, next);
        return { ...next };
      },
    },
    stripeConnectAccount: {
      findUnique: async ({ where }: any) => {
        const onboardingStatus = stripeStatus.get(where.orgId);
        if (!onboardingStatus) return null;
        return { onboardingStatus };
      },
    },
  };
}

function makeSeedCampaign(orgId = 'org_1'): CampaignRow {
  return {
    id: 'campaign_1',
    orgId,
    title: 'Campaign One',
    slug: 'campaign-one',
    description: null,
    status: 'DRAFT',
    goalAmount: null,
    currency: 'USD',
    startsAt: null,
    endsAt: null,
    publishedAt: null,
    archivedAt: null,
    createdAt: new Date('2026-05-28T00:00:00.000Z'),
    updatedAt: new Date('2026-05-28T00:00:00.000Z'),
  };
}

test('auth failures return 401 for campaign routes', async () => {
  const h = createHarness();
  registerCampaignRoutes(h.app, (() => undefined) as any, { db: createDb() as any });

  const routes = [
    ['GET /api/org/campaigns', {}],
    ['POST /api/org/campaigns', { body: { title: 'A' } }],
    ['GET /api/org/campaigns/:id', { params: { id: 'x' } }],
    ['PATCH /api/org/campaigns/:id', { params: { id: 'x' }, body: {} }],
    ['POST /api/org/campaigns/:id/publish', { params: { id: 'x' } }],
    ['POST /api/org/campaigns/:id/archive', { params: { id: 'x' } }],
  ] as const;

  for (const [key, req] of routes) {
    const handler = h.handlers.get(key);
    assert.ok(handler);
    const res = h.response();
    await handler!(req, res, () => undefined);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'AUTH_INVALID' });
  }
});

test('create/list/get/update campaign are org-scoped', async () => {
  const h = createHarness();
  registerCampaignRoutes(h.app, (() => undefined) as any, { db: createDb() as any });

  const createHandler = h.handlers.get('POST /api/org/campaigns');
  const listHandler = h.handlers.get('GET /api/org/campaigns');
  const getHandler = h.handlers.get('GET /api/org/campaigns/:id');
  const patchHandler = h.handlers.get('PATCH /api/org/campaigns/:id');

  assert.ok(createHandler && listHandler && getHandler && patchHandler);

  const createdRes = h.response();
  await createHandler!({ auth: { orgId: 'org_1' }, body: { title: 'School Drive' } }, createdRes, () => undefined);
  assert.equal(createdRes.statusCode, 201);
  const createdId = createdRes.body.campaign.id;

  const listRes = h.response();
  await listHandler!({ auth: { orgId: 'org_1' } }, listRes, () => undefined);
  assert.equal(listRes.statusCode, 200);
  assert.equal(listRes.body.campaigns.length, 1);

  const getResWrongOrg = h.response();
  await getHandler!({ auth: { orgId: 'org_2' }, params: { id: createdId } }, getResWrongOrg, () => undefined);
  assert.equal(getResWrongOrg.statusCode, 404);

  const patchRes = h.response();
  await patchHandler!(
    { auth: { orgId: 'org_1' }, params: { id: createdId }, body: { title: 'School Drive Updated' } },
    patchRes,
    () => undefined,
  );
  assert.equal(patchRes.statusCode, 200);
  assert.equal(patchRes.body.campaign.title, 'School Drive Updated');
});

test('publish blocked without Stripe Connect ENABLED and succeeds with ENABLED', async () => {
  const hBlocked = createHarness();
  registerCampaignRoutes(hBlocked.app, (() => undefined) as any, {
    db: createDb({ campaigns: [makeSeedCampaign('org_1')], stripeStatus: { org_1: 'IN_PROGRESS' } }) as any,
  });

  const blocked = hBlocked.handlers.get('POST /api/org/campaigns/:id/publish');
  assert.ok(blocked);
  const blockedRes = hBlocked.response();
  await blocked!({ auth: { orgId: 'org_1' }, params: { id: 'campaign_1' } }, blockedRes, () => undefined);
  assert.equal(blockedRes.statusCode, 409);
  assert.deepEqual(blockedRes.body, { error: 'STRIPE_CONNECT_NOT_ENABLED' });

  const hEnabled = createHarness();
  registerCampaignRoutes(hEnabled.app, (() => undefined) as any, {
    db: createDb({ campaigns: [makeSeedCampaign('org_1')], stripeStatus: { org_1: 'ENABLED' } }) as any,
  });

  const enabled = hEnabled.handlers.get('POST /api/org/campaigns/:id/publish');
  assert.ok(enabled);
  const enabledRes = hEnabled.response();
  await enabled!({ auth: { orgId: 'org_1' }, params: { id: 'campaign_1' } }, enabledRes, () => undefined);
  assert.equal(enabledRes.statusCode, 200);
  assert.equal(enabledRes.body.campaign.status, 'LIVE');
});

test('archive endpoint transitions campaign to ARCHIVED', async () => {
  const h = createHarness();
  registerCampaignRoutes(h.app, (() => undefined) as any, {
    db: createDb({ campaigns: [makeSeedCampaign('org_1')] }) as any,
  });

  const archive = h.handlers.get('POST /api/org/campaigns/:id/archive');
  assert.ok(archive);

  const res = h.response();
  await archive!({ auth: { orgId: 'org_1' }, params: { id: 'campaign_1' } }, res, () => undefined);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.campaign.status, 'ARCHIVED');
});
