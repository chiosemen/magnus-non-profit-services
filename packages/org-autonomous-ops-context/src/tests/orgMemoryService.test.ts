import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@magnus/db/types';
import { OrgMemoryService, AUTONOMOUS_OPS_MEMORY_DISCLAIMER } from '../orgMemoryService';

function makeMockDb() {
  const orgId = '00000000-0000-4000-8000-000000000001';
  const operational: any[] = [];
  const curated: any[] = [];
  const semantic: any[] = [];

  const db = {
    organization: {
      findUnique: async () => ({ id: orgId }),
    },
    agentRun: {
      findUnique: async () => null,
    },
    agentOperationalMemoryEntry: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: randomUUID(),
          ...data,
          createdAt: new Date(),
          recallDisabled: data.recallDisabled ?? false,
          recallDisabledReason: data.recallDisabledReason ?? null,
          confidence: data.confidence ?? null,
        };
        operational.push(row);
        return row;
      },
      findMany: async ({ where, orderBy, take }: any) => {
        let rows = operational.filter(r => r.orgId === where.orgId);
        if (Object.prototype.hasOwnProperty.call(where, 'recallDisabled')) {
          rows = rows.filter(r => r.recallDisabled === where.recallDisabled);
        }
        rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows.slice(0, take ?? 200);
      },
      findFirst: async ({ where }: any) => operational.find(r => r.id === where.id && r.orgId === where.orgId) ?? null,
      update: async ({ where, data }: any) => {
        const i = operational.findIndex(r => r.id === where.id);
        if (i < 0) throw new Error('missing');
        operational[i] = { ...operational[i], ...data };
        return operational[i];
      },
    },
    orgCuratedMemoryItem: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: randomUUID(),
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        curated.push(row);
        return row;
      },
      findMany: async ({ where, take }: any) => {
        let rows = curated.filter(r => r.orgId === where.orgId);
        if (Object.prototype.hasOwnProperty.call(where, 'isActive')) {
          rows = rows.filter(r => r.isActive === where.isActive);
        }
        rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        return rows.slice(0, take ?? 200);
      },
      findFirst: async ({ where }: any) => curated.find(r => r.id === where.id && r.orgId === where.orgId) ?? null,
      update: async ({ where, data }: any) => {
        const i = curated.findIndex(r => r.id === where.id);
        if (i < 0) throw new Error('missing');
        curated[i] = { ...curated[i], ...data, updatedAt: new Date() };
        return curated[i];
      },
    },
    orgSemanticMemoryChunk: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: randomUUID(), ...data, createdAt: new Date() };
        semantic.push(row);
        return row;
      },
      findMany: async ({ where, take }: any) => {
        const q = (where.chunkText?.contains as string)?.toLowerCase() ?? '';
        const rows = semantic
          .filter(r => r.orgId === where.orgId)
          .filter(r => String(r.chunkText).toLowerCase().includes(q))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows.slice(0, take ?? 20);
      },
    },
  };

  return { db: db as unknown as PrismaClient, orgId, operational, curated, semantic };
}

test('appendOperational stores confidence and lists excluding recallDisabled by default', async () => {
  const { db, orgId, operational } = makeMockDb();
  const svc = new OrgMemoryService(db);
  await svc.appendOperational(orgId, {
    agentName: 'A',
    kind: 'digest',
    payload: { x: 1 },
    sourceRefs: [{ type: 'test_ref', id: '1' }],
    confidence: 0.7,
  });
  assert.equal(operational.length, 1);
  const listed = await svc.listOperational(orgId);
  assert.equal(listed.length, 1);
  await svc.setOperationalRecallDisabled(orgId, operational[0].id, true, 'privacy');
  const listed2 = await svc.listOperational(orgId);
  assert.equal(listed2.length, 0);
  const listed3 = await svc.listOperational(orgId, { includeRecallDisabled: true });
  assert.equal(listed3.length, 1);
});

test('setOperationalRecallDisabled fails closed without reason', async () => {
  const { db, orgId, operational } = makeMockDb();
  const svc = new OrgMemoryService(db);
  await svc.appendOperational(orgId, {
    agentName: 'A',
    kind: 'digest',
    payload: { x: 1 },
    sourceRefs: [{ type: 'test_ref', id: 'x' }],
  });
  await assert.rejects(
    () => svc.setOperationalRecallDisabled(orgId, operational[0].id, true, '  '),
    /RECALL_DISABLED_REASON_REQUIRED/,
  );
});

test('createCurated and deactivateCurated affect active list', async () => {
  const { db, orgId, curated } = makeMockDb();
  const svc = new OrgMemoryService(db);
  const item = await svc.createCurated(orgId, {
    body: 'Lesson learned',
    confidence: 0.9,
    sourceRefs: [{ type: 'test_ref', id: '2' }],
  });
  assert.equal(curated.length, 1);
  let act = await svc.listCurated(orgId);
  assert.equal(act.length, 1);
  await svc.deactivateCurated(orgId, item.id);
  act = await svc.listCurated(orgId);
  assert.equal(act.length, 0);
  const all = await svc.listCurated(orgId, { includeInactive: true });
  assert.equal(all.length, 1);
  assert.equal(all[0]?.isActive, false);
});

test('searchSemantic uses keyword match and exposes disclaimer', async () => {
  const { db, orgId } = makeMockDb();
  const svc = new OrgMemoryService(db);
  await svc.ingestSemanticChunk(orgId, {
    chunkText: 'Board prefers Q4 reports early.',
    sourceRefs: [{ type: 'test_ref', id: '3' }],
  });
  const res = await svc.searchSemantic(orgId, 'Q4');
  assert.equal(res.matchMode, 'keyword_insensitive_contains');
  assert.equal(res.semanticReady, false);
  assert.equal(res.disclaimer, AUTONOMOUS_OPS_MEMORY_DISCLAIMER);
  assert.equal(res.chunks.length, 1);
});

test('invalid confidence on append throws', async () => {
  const { db, orgId } = makeMockDb();
  const svc = new OrgMemoryService(db);
  await assert.rejects(
    () =>
      svc.appendOperational(orgId, {
        agentName: 'A',
        kind: 'k',
        payload: {},
        sourceRefs: [{ type: 'test_ref', id: '4' }],
        confidence: Number.NaN,
      }),
    /INVALID_CONFIDENCE/,
  );
});

test('invalid sourceRefs throws (must be array of typed refs)', async () => {
  const { db, orgId } = makeMockDb();
  const svc = new OrgMemoryService(db);
  await assert.rejects(
    () =>
      svc.appendOperational(orgId, {
        agentName: 'A',
        kind: 'k',
        payload: {},
        sourceRefs: { type: 'x' },
      }),
    /INVALID_SOURCE_REFS/,
  );
  await assert.rejects(
    () =>
      svc.appendOperational(orgId, {
        agentName: 'A',
        kind: 'k',
        payload: {},
        sourceRefs: [{}],
      }),
    /INVALID_SOURCE_REFS/,
  );
});
