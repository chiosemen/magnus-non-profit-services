/**
 * P0-7 behavioural test — a newly created Organization must NOT be entitled.
 *
 * The register route omits subscriptionStatus so the column default applies.
 * If that default is ACTIVE, every self-registration mints a fully entitled
 * org that apps/agents/scheduler picks up on
 * where: { subscriptionStatus: 'ACTIVE' } and burns real agent/AI spend for.
 *
 * This runs against the ephemeral Postgres in CI (REQUIRE_DB_TESTS=1), so it
 * asserts the real migrated schema, not the Prisma schema file.
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
    registerDbUnavailable('P0-7 subscriptionStatus default tests', 'DATABASE_URL unreachable');
    return;
  }

  const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

  test('SubscriptionStatus enum includes PENDING', async () => {
    const rows = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT enumlabel FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'SubscriptionStatus'
    `;
    const labels = rows.map((r) => r.enumlabel);
    assert.ok(labels.length >= 4, `expected at least 4 enum values, got ${labels.join(',')}`);
    assert.ok(labels.includes('PENDING'), `PENDING missing from: ${labels.join(',')}`);
  });

  test('Organization.subscriptionStatus defaults to PENDING, not ACTIVE', async () => {
    const rows = await prisma.$queryRaw<Array<{ column_default: string | null }>>`
      SELECT column_default FROM information_schema.columns
      WHERE table_name = 'Organization' AND column_name = 'subscriptionStatus'
    `;
    assert.equal(rows.length, 1, 'Organization.subscriptionStatus column must exist');
    const def = rows[0]?.column_default ?? '';
    assert.match(def, /PENDING/, `default must be PENDING, got: ${def}`);
    assert.ok(!/'ACTIVE'/.test(def), 'default must not be ACTIVE — that mints entitled orgs');
  });

  test('an org created without an explicit status is NOT entitled', async () => {
    const ein = `99-${String(Date.now()).slice(-7)}`;
    const org = await prisma.organization.create({
      data: { ein, name: 'P0-7 default probe', subscriptionTier: 'STARTER' },
      select: { id: true, subscriptionStatus: true },
    });
    try {
      assert.notEqual(
        org.subscriptionStatus,
        'ACTIVE',
        'a self-registration-shaped insert must not produce an ACTIVE org'
      );
      assert.equal(org.subscriptionStatus, 'PENDING');
      // The scheduler's own predicate must not select it.
      const picked = await prisma.organization.findMany({
        where: { id: org.id, subscriptionStatus: 'ACTIVE' },
        select: { id: true },
      });
      assert.equal(picked.length, 0, 'scheduler predicate must not pick up a PENDING org');
    } finally {
      await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
    }
  });
})();
