/**
 * Magnus DB — Encryption Integration Tests
 *
 * These tests verify encryption works end-to-end with Prisma.
 * They require a valid DATABASE_URL connection.
 *
 * CI BEHAVIOR:
 * - If DATABASE_URL is not set or connection fails, tests are SKIPPED (not failed)
 * - This allows CI to pass without a live database while still running when available
 * - To run integration tests locally: ensure DATABASE_URL is set in .env
 */

import { config } from 'dotenv';
import { join } from 'path';

// Load .env from project root
config({ path: join(__dirname, '..', '..', '..', '..', '.env') });

import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { encryptionExtension, isEncrypted } from '../encryptionExtension';

// Check if DATABASE_URL looks like a valid remote DB
const DATABASE_URL = process.env.DATABASE_URL;
const HAS_DB_CONFIG = DATABASE_URL && !DATABASE_URL.includes('localhost:5432/magnus');

// Test connection availability before running integration tests
async function canConnectToDb(): Promise<boolean> {
  if (!HAS_DB_CONFIG) return false;

  const testClient = new PrismaClient();
  try {
    await testClient.$queryRaw`SELECT 1`;
    await testClient.$disconnect();
    return true;
  } catch {
    await testClient.$disconnect().catch(() => {});
    return false;
  }
}

// Run integration tests only if we can connect
(async () => {
  const dbAvailable = await canConnectToDb();

  if (!dbAvailable) {
    // Register a single skipped test for visibility
    test('SKIP: Encryption integration tests (no DB connection)', { skip: 'DATABASE_URL not configured or unreachable' }, () => {});
    return;
  }

  // DB is available - run integration tests
  const basePrisma = new PrismaClient();
  const prisma: any = basePrisma.$extends(encryptionExtension);

  test('Integration: Worker ssnEncrypted is encrypted on create', async () => {
    const testSSN = '123-45-6789';
    const worker = await prisma.worker.create({
      data: {
        email: `test-ssn-${Date.now()}@example.com`,
        name: 'Test Worker SSN',
        ssnEncrypted: testSSN,
      },
    });

    try {
      // Read back with regular client (no extension) to verify encryption
      const rawWorker = await basePrisma.worker.findUnique({
        where: { id: worker.id },
      });

      assert.ok(rawWorker, 'worker should exist');
      assert.equal(isEncrypted(rawWorker.ssnEncrypted), true, 'ssnEncrypted should be encrypted in DB');
      assert.notEqual(rawWorker.ssnEncrypted, testSSN, 'ssnEncrypted should not be plaintext in DB');
      assert.equal(worker.ssnEncrypted, testSSN, 'ssnEncrypted should decrypt to original value');
    } finally {
      await basePrisma.worker.delete({ where: { id: worker.id } }).catch(() => {});
    }
  });

  test('Integration: Worker plaidAccessToken is encrypted on update', async () => {
    const worker = await prisma.worker.create({
      data: {
        email: `test-plaid-${Date.now()}@example.com`,
        name: 'Test Worker Plaid',
      },
    });

    try {
      const testToken = 'access-sandbox-token-1234';
      const updated = await prisma.worker.update({
        where: { id: worker.id },
        data: { plaidAccessToken: testToken },
      });

      const rawWorker = await basePrisma.worker.findUnique({
        where: { id: worker.id },
      });

      assert.ok(rawWorker, 'worker should exist');
      assert.equal(isEncrypted(rawWorker.plaidAccessToken), true, 'plaidAccessToken should be encrypted');
      assert.notEqual(rawWorker.plaidAccessToken, testToken, 'plaidAccessToken should not be plaintext');
      assert.equal(updated.plaidAccessToken, testToken, 'plaidAccessToken should decrypt correctly');
    } finally {
      await basePrisma.worker.delete({ where: { id: worker.id } }).catch(() => {});
    }
  });

  test('Integration: Organization plaidAccessToken is encrypted on upsert', async () => {
    const testEIN = `99-${Date.now().toString().slice(-7)}`;
    const testToken = 'access-org-token-5678';

    const org = await prisma.organization.upsert({
      where: { ein: testEIN },
      update: { plaidAccessToken: testToken },
      create: {
        name: 'Test Org Encryption',
        ein: testEIN,
        plaidAccessToken: testToken,
      },
    });

    try {
      const rawOrg = await basePrisma.organization.findUnique({
        where: { id: org.id },
      });

      assert.ok(rawOrg, 'org should exist');
      assert.equal(isEncrypted(rawOrg.plaidAccessToken), true, 'plaidAccessToken should be encrypted');
      assert.equal(org.plaidAccessToken, testToken, 'plaidAccessToken should decrypt correctly');
    } finally {
      await basePrisma.organization.delete({ where: { id: org.id } }).catch(() => {});
    }
  });

  // Cleanup on exit
  process.on('exit', () => {
    basePrisma.$disconnect().catch(() => {});
  });
})();
