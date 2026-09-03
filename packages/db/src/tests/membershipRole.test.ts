/**
 * MR-1 · MR-5 · MR-6 — the membership role exists at the database, defaults to
 * least privilege, and the active-membership predicate holds.
 *
 * Spec: docs/security/MEMBERSHIP-ROLES.md. Closes docs/releases/7430ad0.md §7.
 *
 * Runs against the ephemeral Postgres in CI (REQUIRE_DB_TESTS=1), so it asserts
 * the real migrated schema, not the Prisma schema file (SPEC-P0 R11). The
 * fixture that omits `role` does so on purpose to probe the column default
 * (R13 — stated here rather than inherited silently).
 *
 * R12: run against the pre-change database and observed red — the enum did not
 * exist and the column did not exist — before the migration was written.
 */
import { config } from 'dotenv';
import { join } from 'path';

config({ path: join(__dirname, '..', '..', '..', '..', '.env') });

import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { assertSafeTestDatabaseUrl, registerDbUnavailable } from './dbTestGuard';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres@localhost/magnus';
// SPEC-P0 R3: refuse to touch anything that could be a real database.
assertSafeTestDatabaseUrl(DATABASE_URL);

async function canConnectToDb(): Promise<boolean> {
  const c = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  try {
    await c.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await c.$disconnect().catch(() => {});
  }
}

(async () => {
  if (!(await canConnectToDb())) {
    registerDbUnavailable('MR membership role tests', 'DATABASE_URL unreachable');
    return;
  }

  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

  test('MR-1: OrgRole enum exists with exactly ADMIN and MEMBER', async () => {
    const rows = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT enumlabel FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'OrgRole'
      ORDER BY enumlabel
    `;
    assert.deepEqual(
      rows.map((r) => r.enumlabel),
      ['ADMIN', 'MEMBER'],
      'OrgRole must exist with ADMIN and MEMBER and nothing else'
    );
  });

  test('MR-5: WorkerOrgRelationship.role is NOT NULL and defaults to MEMBER', async () => {
    const rows = await prisma.$queryRaw<Array<{ column_default: string | null; is_nullable: string }>>`
      SELECT column_default, is_nullable FROM information_schema.columns
      WHERE table_name = 'WorkerOrgRelationship' AND column_name = 'role'
    `;
    assert.equal(rows.length, 1, 'WorkerOrgRelationship.role column must exist');
    assert.equal(rows[0]?.is_nullable, 'NO', 'role must be NOT NULL — a membership without authority is undefined');
    const def = rows[0]?.column_default ?? '';
    assert.match(def, /MEMBER/, `default must be MEMBER, got: ${def}`);
    assert.ok(!/'ADMIN'/.test(def), 'default must not be ADMIN — that is the hardcoded claim again, in the schema');
  });

  test('MR-5: a membership created without an explicit role is MEMBER, and an ended one is not active', async () => {
    const ein = `98-${String(Date.now()).slice(-7)}`;
    const org = await prisma.organization.create({
      data: { ein, name: 'MR role probe', subscriptionTier: 'STARTER', subscriptionStatus: 'PENDING' },
      select: { id: true },
    });
    const worker = await prisma.worker.create({
      data: { email: `mr-role-${Date.now()}@example.invalid`, name: 'MR probe' },
      select: { id: true },
    });
    try {
      // Deliberately omits `role` (R13: stated) — this is the default probe.
      const rel = await prisma.workerOrgRelationship.create({
        data: {
          workerId: worker.id,
          orgId: org.id,
          relationshipType: 'W2_EMPLOYEE',
          startDate: new Date('2026-01-01T00:00:00Z'),
          grantFunded: false,
        },
        select: { id: true, role: true },
      });
      assert.equal(rel.role, 'MEMBER', 'an invite-shaped insert must produce a MEMBER, never an ADMIN');

      // MR-3 at the database: the predicate the application uses.
      const now = new Date();
      const activeBefore = await prisma.workerOrgRelationship.findFirst({
        where: { workerId: worker.id, orgId: org.id, OR: [{ endDate: null }, { endDate: { gt: now } }] },
        select: { id: true },
      });
      assert.ok(activeBefore, 'an open-ended membership is active');

      await prisma.workerOrgRelationship.update({
        where: { id: rel.id },
        data: { endDate: new Date(Date.now() - 60_000) },
      });
      const activeAfter = await prisma.workerOrgRelationship.findFirst({
        where: { workerId: worker.id, orgId: org.id, OR: [{ endDate: null }, { endDate: { gt: new Date() } }] },
        select: { id: true },
      });
      assert.equal(activeAfter, null, 'an ended membership must not satisfy the active predicate');
    } finally {
      await prisma.workerOrgRelationship.deleteMany({ where: { workerId: worker.id } }).catch(() => {});
      await prisma.worker.delete({ where: { id: worker.id } }).catch(() => {});
      await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
    }
  });
})();
