import { config } from 'dotenv';
import { join } from 'path';

// Load .env from project root (../../ from packages/db)
config({ path: join(__dirname, '..', '..', '..', '..', '.env') });

import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { encryptionExtension } from '../encryptionExtension';
import { isEncrypted } from '../encryptionExtension';

// Create test client with extension
const basePrisma = new PrismaClient();
const prisma = basePrisma.$extends(encryptionExtension);

test('Worker: encrypt ssnEncrypted on create', async () => {
  const testSSN = '123-45-6789';

  const worker = await prisma.worker.create({
    data: {
      email: `test-ssn-${Date.now()}@example.com`,
      name: 'Test Worker SSN',
      ssnEncrypted: testSSN,
    },
  });

  // Read back with regular client (no extension) to verify encryption
  const rawWorker = await basePrisma.worker.findUnique({
    where: { id: worker.id },
  });

  assert.ok(rawWorker, 'worker should exist');
  assert.equal(isEncrypted(rawWorker!.ssnEncrypted), true, 'ssnEncrypted should be encrypted in DB');
  assert.notEqual(rawWorker!.ssnEncrypted, testSSN, 'ssnEncrypted should not be plaintext in DB');

  // Read with extended client should decrypt
  assert.equal(worker.ssnEncrypted, testSSN, 'ssnEncrypted should decrypt to original value');

  // Cleanup
  await basePrisma.worker.delete({ where: { id: worker.id } });
});

test('Worker: encrypt plaidAccessToken on update', async () => {
  const worker = await prisma.worker.create({
    data: {
      email: `test-plaid-${Date.now()}@example.com`,
      name: 'Test Worker Plaid',
    },
  });

  const testToken = 'access-sandbox-token-1234';

  const updated = await prisma.worker.update({
    where: { id: worker.id },
    data: {
      plaidAccessToken: testToken,
    },
  });

  // Verify encryption in database
  const rawWorker = await basePrisma.worker.findUnique({
    where: { id: worker.id },
  });

  assert.ok(rawWorker, 'worker should exist');
  assert.equal(isEncrypted(rawWorker!.plaidAccessToken), true, 'plaidAccessToken should be encrypted in DB');

  // Verify decryption
  assert.equal(updated.plaidAccessToken, testToken, 'plaidAccessToken should decrypt to original value');

  // Cleanup
  await basePrisma.worker.delete({ where: { id: worker.id } });
});

test('Worker: handle null values correctly', async () => {
  const worker = await prisma.worker.create({
    data: {
      email: `test-null-${Date.now()}@example.com`,
      name: 'Test Worker Null',
      ssnEncrypted: null,
      plaidAccessToken: null,
    },
  });

  assert.equal(worker.ssnEncrypted, null, 'ssnEncrypted should be null');
  assert.equal(worker.plaidAccessToken, null, 'plaidAccessToken should be null');

  // Verify in database
  const rawWorker = await basePrisma.worker.findUnique({
    where: { id: worker.id },
  });

  assert.equal(rawWorker!.ssnEncrypted, null, 'ssnEncrypted should be null in DB');
  assert.equal(rawWorker!.plaidAccessToken, null, 'plaidAccessToken should be null in DB');

  // Cleanup
  await basePrisma.worker.delete({ where: { id: worker.id } });
});

test('Worker: upsert encrypts both create and update paths', async () => {
  const email = `test-upsert-${Date.now()}@example.com`;
  const token1 = 'token-create';
  const token2 = 'token-update';

  // First upsert (create path)
  await prisma.worker.upsert({
    where: { email },
    create: {
      email,
      name: 'Test Upsert',
      plaidAccessToken: token1,
    },
    update: {},
  });

  let rawWorker = await basePrisma.worker.findUnique({ where: { email } });
  assert.ok(rawWorker, 'worker should exist after create');
  assert.equal(isEncrypted(rawWorker!.plaidAccessToken), true, 'plaidAccessToken should be encrypted after create');

  // Second upsert (update path)
  await prisma.worker.upsert({
    where: { email },
    create: {
      email,
      name: 'Test Upsert',
    },
    update: {
      plaidAccessToken: token2,
    },
  });

  rawWorker = await basePrisma.worker.findUnique({ where: { email } });
  assert.ok(rawWorker, 'worker should exist after update');
  assert.equal(isEncrypted(rawWorker!.plaidAccessToken), true, 'plaidAccessToken should be encrypted after update');

  // Cleanup
  await basePrisma.worker.delete({ where: { email } });
});

test('Organization: encrypt plaidAccessToken on create', async () => {
  const testToken = 'access-sandbox-org-token';
  const ein = `99-${Date.now().toString().slice(-7)}`;

  const org = await prisma.organization.create({
    data: {
      ein,
      name: 'Test Organization',
      subscriptionTier: 'STARTER',
      plaidAccessToken: testToken,
    },
  });

  // Verify encryption
  const rawOrg = await basePrisma.organization.findUnique({
    where: { id: org.id },
  });

  assert.ok(rawOrg, 'organization should exist');
  assert.equal(isEncrypted(rawOrg!.plaidAccessToken), true, 'plaidAccessToken should be encrypted in DB');
  assert.equal(org.plaidAccessToken, testToken, 'plaidAccessToken should decrypt to original value');

  // Cleanup
  await basePrisma.organization.delete({ where: { id: org.id } });
});

test('Organization: upsert encrypts both create and update', async () => {
  const ein = `99-${Date.now().toString().slice(-7)}`;
  const token1 = 'token-create';
  const token2 = 'token-update';

  // First upsert (create)
  await prisma.organization.upsert({
    where: { ein },
    create: {
      ein,
      name: 'Test Org',
      subscriptionTier: 'STARTER',
      plaidAccessToken: token1,
    },
    update: {},
  });

  let rawOrg = await basePrisma.organization.findUnique({ where: { ein } });
  assert.ok(rawOrg, 'organization should exist after create');
  assert.equal(isEncrypted(rawOrg!.plaidAccessToken), true, 'plaidAccessToken should be encrypted after create');

  // Second upsert (update)
  await prisma.organization.upsert({
    where: { ein },
    create: {
      ein,
      name: 'Test Org',
      subscriptionTier: 'STARTER',
    },
    update: {
      plaidAccessToken: token2,
    },
  });

  rawOrg = await basePrisma.organization.findUnique({ where: { ein } });
  assert.ok(rawOrg, 'organization should exist after update');
  assert.equal(isEncrypted(rawOrg!.plaidAccessToken), true, 'plaidAccessToken should be encrypted after update');

  // Cleanup
  await basePrisma.organization.delete({ where: { ein } });
});

test('Worker: createMany encrypts all records', async () => {
  const timestamp = Date.now();
  const workers = [
    {
      email: `test-bulk-1-${timestamp}@example.com`,
      name: 'Bulk Worker 1',
      ssnEncrypted: '111-11-1111',
    },
    {
      email: `test-bulk-2-${timestamp}@example.com`,
      name: 'Bulk Worker 2',
      ssnEncrypted: '222-22-2222',
    },
  ];

  await prisma.worker.createMany({
    data: workers,
  });

  // Verify both are encrypted
  const createdWorkers = await basePrisma.worker.findMany({
    where: {
      email: {
        in: workers.map((w) => w.email),
      },
    },
  });

  assert.equal(createdWorkers.length, 2, 'should create 2 workers');
  for (const worker of createdWorkers) {
    assert.equal(isEncrypted(worker.ssnEncrypted), true, `worker ${worker.email} ssnEncrypted should be encrypted`);
  }

  // Cleanup
  await basePrisma.worker.deleteMany({
    where: {
      email: {
        in: workers.map((w) => w.email),
      },
    },
  });
});

// Cleanup after all tests
test.after(async () => {
  await basePrisma.$disconnect();
});
