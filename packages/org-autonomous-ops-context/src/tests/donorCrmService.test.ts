

import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient, DonorType } from '@magnus/db/types';
import {
  listDonors,
  createDonor,
  updateDonor,
  getDonorDetail,
  createManualDonation,
  listDonations,
  issueReceipt,
  getReceiptMetadata,
  voidReceipt,
  previewCsvImport,
  commitCsvImport,
} from '../donorCrmService';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres@localhost/magnus';

async function canConnectToDb(): Promise<boolean> {
  const testClient = new PrismaClient({
    datasources: { db: { url: DATABASE_URL } },
  });
  try {
    await testClient.$queryRaw`SELECT 1`;
    await testClient.$disconnect();
    return true;
  } catch {
    await testClient.$disconnect().catch(() => {});
    return false;
  }
}

(async () => {
  const dbAvailable = await canConnectToDb();

  if (!dbAvailable) {
    test('SKIP: S4NP service tests (no DB connection)', { skip: 'DATABASE_URL unreachable' }, () => {});
    return;
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: DATABASE_URL } },
  });

  const setupTestOrg = async (ein: string, name: string) => {
    return await prisma.organization.upsert({
      where: { ein },
      update: {},
      create: {
        name,
        ein,
        subscriptionTier: 'ENTERPRISE',
      },
    });
  };

  test('Service: donor creation & normalization', async () => {
    const org = await setupTestOrg('00-7777777', 'Service Org A');

    // 1. Success create
    const donor = await createDonor(prisma, org.id, {
      name: '  Alice Cooper  ',
      email: '  ALICE@Cooper.com  ',
      phone: '  +1-555-0199  ',
      addressJson: '{"street": "456 Oak Rd"}',
    });

    try {
      assert.equal(donor.name, 'Alice Cooper');
      assert.equal(donor.email, 'alice@cooper.com');
      assert.equal(donor.phone, '+1-555-0199');
      assert.equal(donor.addressJson, '{"street": "456 Oak Rd"}');

      // 2. Reject validation errors
      await assert.rejects(
        createDonor(prisma, org.id, { name: '', email: 'invalid' }),
        /NAME_REQUIRED|INVALID_EMAIL/
      );

      await assert.rejects(
        createDonor(prisma, org.id, { name: 'Bob', email: 'bob@example.com', phone: 'abc' }),
        /INVALID_PHONE/
      );
    } finally {
      await prisma.donor.deleteMany({ where: { orgId: org.id } });
      await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
    }
  });

  test('Service: tenant isolation', async () => {
    const org1 = await setupTestOrg('00-8888888', 'Service Org B1');
    const org2 = await setupTestOrg('00-9999999', 'Service Org B2');

    const donor1 = await createDonor(prisma, org1.id, { name: 'Org1 Donor', email: 'org1@test.com' });
    const donor2 = await createDonor(prisma, org2.id, { name: 'Org2 Donor', email: 'org2@test.com' });

    try {
      // List scoped to Org 1 should only return Donor 1
      const list1 = await listDonors(prisma, org1.id);
      assert.equal(list1.length, 1);
      assert.equal(list1[0].name, 'Org1 Donor');

      // Detail scoped to Org 1 for Donor 2 should fail
      await assert.rejects(
        getDonorDetail(prisma, org1.id, donor2.id),
        /DONOR_NOT_FOUND/
      );
    } finally {
      await prisma.donor.deleteMany({ where: { id: { in: [donor1.id, donor2.id] } } });
      await prisma.organization.deleteMany({ where: { id: { in: [org1.id, org2.id] } } }).catch(() => {});
    }
  });

  test('Service: manual donation creation & validations', async () => {
    const org = await setupTestOrg('00-1234567', 'Service Org C');
    const donor = await createDonor(prisma, org.id, { name: 'Charlie Brown' });

    try {
      // 1. Valid manual donation
      const donation = await createManualDonation(prisma, org.id, {
        donorId: donor.id,
        amount: 250.00,
        currency: 'USD',
        receivedAt: new Date('2026-05-01T00:00:00Z'),
        paymentMethod: 'CHECK',
        referenceNumber: 'CHK-900',
        notes: 'Annual contribution',
      });

      assert.equal(donation.amount, '250');
      assert.equal(donation.paymentMethod, 'CHECK');

      // 2. Reject negative amounts
      await assert.rejects(
        createManualDonation(prisma, org.id, {
          donorId: donor.id,
          amount: -50,
          receivedAt: new Date(),
          paymentMethod: 'CASH',
        }),
        /INVALID_AMOUNT/
      );
    } finally {
      await prisma.donation.deleteMany({ where: { orgId: org.id } });
      await prisma.donor.deleteMany({ where: { orgId: org.id } });
      await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
    }
  });

  test('Service: receipt lifecycle & voiding', async () => {
    const org = await setupTestOrg('00-7654321', 'Service Org D');
    const donor = await createDonor(prisma, org.id, { name: 'Diana' });
    const donation = await createManualDonation(prisma, org.id, {
      donorId: donor.id,
      amount: 500.00,
      receivedAt: new Date(),
      paymentMethod: 'WIRE',
    });

    // 1. Issue receipt
    const receipt1 = await issueReceipt(prisma, org.id, donation.id);
    assert.equal(receipt1.status, 'ISSUED');
    assert.ok(receipt1.receiptNumber.startsWith('REC-'));

    // 2. Issue receipt again is idempotent
    const receipt2 = await issueReceipt(prisma, org.id, donation.id);
    assert.equal(receipt2.id, receipt1.id);
    assert.equal(receipt2.receiptNumber, receipt1.receiptNumber);

    // 3. Void receipt
    const voided = await voidReceipt(prisma, org.id, receipt1.id, 'Written off');
    assert.equal(voided.status, 'VOIDED');
    assert.equal(voided.voidReason, 'Written off');
    assert.ok(voided.voidedAt);

    try {
      // 4. Reject void without reason
      await assert.rejects(
        voidReceipt(prisma, org.id, receipt1.id, '  '),
        /VOID_REASON_REQUIRED/
      );
    } finally {
      await prisma.donationReceipt.deleteMany({ where: { orgId: org.id } });
      await prisma.donation.deleteMany({ where: { orgId: org.id } });
      await prisma.donor.deleteMany({ where: { orgId: org.id } });
      await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
    }
  });

  test('Service: CSV parser, formula injection checks, previews & commits', async () => {
    const org = await setupTestOrg('00-5551111', 'Service Org E');

    const csvContent = `name,email,phone,amount,payment_method,date
Alice Cooper,alice@cooper.com,+1-555-0100,100,CHECK,2026-05-27
Acme Corp,info@acme.corp,,500,WIRE,2026-05-26
=SUM(A1:A2),formula@inj.com,,10,CASH,2026-05-25`; // cell starting with = representing formula injection

    // 1. Preview CSV
    const preview = previewCsvImport(org.id, csvContent);
    assert.equal(preview.totalRows, 3);
    assert.equal(preview.validRowsCount, 3);
    assert.equal(preview.invalidRowsCount, 0);

    // Assert cell sanitization (formula prepended with single quote)
    assert.equal(preview.rows[2].donorName, "'=SUM(A1:A2)");

    // 2. Commit CSV
    const commit = await commitCsvImport(prisma, org.id, csvContent, 'legacy_import.csv');
    assert.equal(commit.rowsProcessed, 3);
    assert.equal(commit.donationsCreated, 3);

    try {
      // 3. Reject malformed CSV headers
      const badCsv = `email,phone\nalice@cooper.com,+1-555-0100`;
      assert.throws(
        () => previewCsvImport(org.id, badCsv),
        /CSV_MISSING_HEADER_NAME/
      );
    } finally {
      await prisma.donationImportRow.deleteMany({ where: { orgId: org.id } });
      await prisma.donationImportBatch.deleteMany({ where: { orgId: org.id } });
      await prisma.donation.deleteMany({ where: { orgId: org.id } });
      await prisma.donor.deleteMany({ where: { orgId: org.id } });
      await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
    }
  });

  // Disconnect prisma
  process.on('exit', () => {
    prisma.$disconnect().catch(() => {});
  });
})();
