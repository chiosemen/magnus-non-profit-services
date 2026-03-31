import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { OrgContextFileKind, PrismaClient } from '@magnus/db/types';
import { OrgIdentityFilesService } from '../orgIdentityFilesService';

type Row = { id: string; orgId: string; kind: OrgContextFileKind; content: string; updatedAt: Date };

function makeFixture() {
  const rows = new Map<string, Row>();
  const orgId = '00000000-0000-4000-8000-000000000001';

  const db = {
    organization: {
      findUnique: async (_args: { where: { id: string } }) => ({
        id: orgId,
        name: 'Test Org',
        ein: '12-3456789',
        fiscalYearEnd: null,
        annualRevenue: null,
        subscriptionTier: 'GROWTH' as const,
      }),
    },
    orgContextFile: {
      findUnique: async (args: { where: { orgId_kind: { orgId: string; kind: OrgContextFileKind } } }) => {
        const { orgId: oid, kind } = args.where.orgId_kind;
        return rows.get(`${oid}:${kind}`) ?? null;
      },
      findMany: async (args: { where: { orgId: string }; orderBy: { kind: string } }) =>
        [...rows.values()].filter(r => r.orgId === args.where.orgId).sort((a, b) => a.kind.localeCompare(b.kind)),
      create: async (args: { data: { orgId: string; kind: OrgContextFileKind; content: string } }) => {
        const id = randomUUID();
        const row: Row = {
          id,
          orgId: args.data.orgId,
          kind: args.data.kind,
          content: args.data.content,
          updatedAt: new Date(),
        };
        rows.set(`${row.orgId}:${row.kind}`, row);
        return row;
      },
      upsert: async (args: {
        where: { orgId_kind: { orgId: string; kind: OrgContextFileKind } };
        create: { orgId: string; kind: OrgContextFileKind; content: string };
        update: { content: string };
      }) => {
        const k = `${args.where.orgId_kind.orgId}:${args.where.orgId_kind.kind}`;
        let row = rows.get(k);
        if (!row) {
          row = {
            id: randomUUID(),
            orgId: args.create.orgId,
            kind: args.create.kind,
            content: args.create.content,
            updatedAt: new Date(),
          };
          rows.set(k, row);
        } else {
          row = { ...row, content: args.update.content, updatedAt: new Date() };
          rows.set(k, row);
        }
        return row;
      },
    },
  };

  return { db: db as unknown as PrismaClient, rows, orgId };
}

test('ensureDefaults creates five persisted kinds once', async () => {
  const { db, rows, orgId } = makeFixture();
  const svc = new OrgIdentityFilesService(db);
  await svc.ensureDefaults(orgId);
  assert.equal(rows.size, 5);
  const kinds = [...rows.values()].map(r => r.kind).sort();
  assert.deepEqual(kinds, [
    'ORG_AGENTS',
    'ORG_HEARTBEAT',
    'ORG_IDENTITY',
    'ORG_MEMORY',
    'ORG_SOUL',
  ]);
});

test('ensureDefaults is idempotent', async () => {
  const { db, rows, orgId } = makeFixture();
  const svc = new OrgIdentityFilesService(db);
  await svc.ensureDefaults(orgId);
  const first = new Map(rows);
  await svc.ensureDefaults(orgId);
  assert.equal(rows.size, 5);
  assert.equal(first.get(`${orgId}:ORG_IDENTITY`)?.content, rows.get(`${orgId}:ORG_IDENTITY`)?.content);
});

test('upsertContent updates existing file', async () => {
  const { db, orgId } = makeFixture();
  const svc = new OrgIdentityFilesService(db);
  await svc.ensureDefaults(orgId);
  await svc.upsertContent(orgId, 'ORG_SOUL', '# ORG_SOUL\n\nUpdated body.');
  const row = await svc.get(orgId, 'ORG_SOUL');
  assert.ok(row?.content.includes('Updated body'));
});

test('ORG_IDENTITY seed contains source-linked header and org fields', async () => {
  const { db, orgId } = makeFixture();
  const svc = new OrgIdentityFilesService(db);
  await svc.ensureDefaults(orgId);
  const row = await svc.get(orgId, 'ORG_IDENTITY');
  assert.match(String(row?.content), /source-linked: prisma\.Organization/);
  assert.match(String(row?.content), /Test Org/);
  assert.match(String(row?.content), /12-3456789/);
});

test('assertContentSize rejects oversized payload', () => {
  const big = 'x'.repeat(600_000);
  assert.throws(() => OrgIdentityFilesService.assertContentSize(big), /CONTENT_TOO_LARGE/);
});
