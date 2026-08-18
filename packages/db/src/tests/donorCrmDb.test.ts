/**
 * Magnus DB — Donor CRM & Receipts Model/Repository Tests
 */

import { config } from 'dotenv';
import { join } from 'path';

// Load .env from project root
config({ path: join(__dirname, '..', '..', '..', '..', '.env') });

import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient, DonorType, DonationSource, ReceiptStatus } from '@prisma/client';
import { assertSafeTestDatabaseUrl, registerDbUnavailable } from './dbTestGuard';

// Use local test database
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres@localhost/magnus';
// SPEC-P0 R3: refuse to touch anything that could be a real database.
assertSafeTestDatabaseUrl(DATABASE_URL);

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
    registerDbUnavailable('S4NP Database integration tests', 'DATABASE_URL unreachable');
    return;
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: DATABASE_URL } },
  });

  // Setup test organization
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

  test('Donor CRM: can create individual and organization donors', async () => {
    const org = await setupTestOrg('00-1111111', 'Org Alpha');

    const individualDonor = await prisma.donor.create({
      data: {
        orgId: org.id,
        donorType: DonorType.INDIVIDUAL,
        name: 'John Doe',
        email: 'john.doe@example.com',
        phone: '123-456-7890',
        addressJson: '{"street": "123 Main St"}',
      },
    });

    const orgDonor = await prisma.donor.create({
      data: {
        orgId: org.id,
        donorType: DonorType.ORGANIZATION,
        name: 'Acme Corp',
        email: 'info@acme.corp',
      },
    });

    try {
      assert.equal(individualDonor.donorType, DonorType.INDIVIDUAL);
      assert.equal(individualDonor.name, 'John Doe');
      assert.equal(individualDonor.email, 'john.doe@example.com');

      assert.equal(orgDonor.donorType, DonorType.ORGANIZATION);
      assert.equal(orgDonor.name, 'Acme Corp');
    } finally {
      // Cleanup
      await prisma.donor.deleteMany({
        where: { id: { in: [individualDonor.id, orgDonor.id] } },
      });
      await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
    }
  });

  test('Donations: can create manual donation record', async () => {
    const org = await setupTestOrg('00-2222222', 'Org Beta');
    const donor = await prisma.donor.create({
      data: {
        orgId: org.id,
        name: 'Jane Smith',
        email: 'jane.smith@example.com',
      },
    });

    const donation = await prisma.donation.create({
      data: {
        orgId: org.id,
        donorId: donor.id,
        amount: 150.50,
        currency: 'USD',
        receivedAt: new Date(),
        paymentMethod: 'MANUAL_CHECK',
        referenceNumber: 'CHK-1002',
        source: DonationSource.MANUAL,
      },
    });

    try {
      assert.equal(donation.amount.toString(), '150.5');
      assert.equal(donation.currency, 'USD');
      assert.equal(donation.paymentMethod, 'MANUAL_CHECK');
      assert.equal(donation.source, DonationSource.MANUAL);
    } finally {
      await prisma.donation.delete({ where: { id: donation.id } });
      await prisma.donor.delete({ where: { id: donor.id } });
      await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
    }
  });

  test('Receipts: enforces unique receipt number per organization', async () => {
    const org1 = await setupTestOrg('00-3333333', 'Org Gamma 1');
    const org2 = await setupTestOrg('00-4444444', 'Org Gamma 2');

    const donor1 = await prisma.donor.create({
      data: { orgId: org1.id, name: 'Donor 1' },
    });
    const donor2 = await prisma.donor.create({
      data: { orgId: org2.id, name: 'Donor 2' },
    });

    const donation1 = await prisma.donation.create({
      data: {
        orgId: org1.id,
        donorId: donor1.id,
        amount: 100.00,
        receivedAt: new Date(),
        paymentMethod: 'CASH',
      },
    });

    const donation2 = await prisma.donation.create({
      data: {
        orgId: org1.id,
        donorId: donor1.id,
        amount: 200.00,
        receivedAt: new Date(),
        paymentMethod: 'CASH',
      },
    });

    const donation3 = await prisma.donation.create({
      data: {
        orgId: org2.id,
        donorId: donor2.id,
        amount: 300.00,
        receivedAt: new Date(),
        paymentMethod: 'CASH',
      },
    });

    const receiptNum = 'REC-20260527-001';

    // Create receipt 1 in Org 1
    const receipt1 = await prisma.donationReceipt.create({
      data: {
        orgId: org1.id,
        donationId: donation1.id,
        receiptNumber: receiptNum,
        status: ReceiptStatus.ISSUED,
        issuedAt: new Date(),
      },
    });

    try {
      // 1. Trying to create receipt with same number in same org must fail (Org Gamma 1)
      await assert.rejects(
        prisma.donationReceipt.create({
          data: {
            orgId: org1.id,
            donationId: donation2.id,
            receiptNumber: receiptNum,
            status: ReceiptStatus.DRAFT,
          },
        }),
        /Unique constraint failed/
      );

      // 2. Creating receipt with same number in a different org must succeed (Org Gamma 2)
      const receipt3 = await prisma.donationReceipt.create({
        data: {
          orgId: org2.id,
          donationId: donation3.id,
          receiptNumber: receiptNum,
          status: ReceiptStatus.ISSUED,
          issuedAt: new Date(),
        },
      });

      assert.equal(receipt3.receiptNumber, receiptNum);

      // Cleanup receipt 3
      await prisma.donationReceipt.delete({ where: { id: receipt3.id } });
    } finally {
      await prisma.donationReceipt.delete({ where: { id: receipt1.id } }).catch(() => {});
      await prisma.donation.deleteMany({ where: { id: { in: [donation1.id, donation2.id, donation3.id] } } });
      await prisma.donor.deleteMany({ where: { id: { in: [donor1.id, donor2.id] } } });
      await prisma.organization.deleteMany({ where: { id: { in: [org1.id, org2.id] } } }).catch(() => {});
    }
  });

  test('Integrity: cannot delete donation if receipt exists', async () => {
    const org = await setupTestOrg('00-5555555', 'Org Delta');
    const donor = await prisma.donor.create({
      data: { orgId: org.id, name: 'Delta Donor' },
    });
    const donation = await prisma.donation.create({
      data: {
        orgId: org.id,
        donorId: donor.id,
        amount: 50.00,
        receivedAt: new Date(),
        paymentMethod: 'WIRE',
      },
    });
    const receipt = await prisma.donationReceipt.create({
      data: {
        orgId: org.id,
        donationId: donation.id,
        receiptNumber: 'REC-DELTA-101',
      },
    });

    try {
      // Trying to delete donation must fail due to Restrict onDelete constraint
      await assert.rejects(
        prisma.donation.delete({ where: { id: donation.id } }),
        /Foreign key constraint/
      );
    } finally {
      // Cleanup in order
      await prisma.donationReceipt.delete({ where: { id: receipt.id } }).catch(() => {});
      await prisma.donation.delete({ where: { id: donation.id } }).catch(() => {});
      await prisma.donor.delete({ where: { id: donor.id } }).catch(() => {});
      await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
    }
  });

  test('Donor CRM: enforces optional unique normalized emails per organization', async () => {
    const org = await setupTestOrg('00-6666666', 'Org Epsilon');

    // Create donor 1 with email
    const donor1 = await prisma.donor.create({
      data: {
        orgId: org.id,
        name: 'Epsilon 1',
        email: 'test@epsilon.com',
      },
    });

    // Create donor 2 with no email (should succeed)
    const donor2 = await prisma.donor.create({
      data: {
        orgId: org.id,
        name: 'Epsilon 2',
      },
    });

    // Create donor 3 with no email (should succeed - email is nullable and not unique for nulls)
    const donor3 = await prisma.donor.create({
      data: {
        orgId: org.id,
        name: 'Epsilon 3',
      },
    });

    try {
      // Creating another donor with same email in same org should fail
      await assert.rejects(
        prisma.donor.create({
          data: {
            orgId: org.id,
            name: 'Epsilon 4',
            email: 'test@epsilon.com',
          },
        }),
        /Unique constraint failed/
      );
    } finally {
      await prisma.donor.deleteMany({ where: { id: { in: [donor1.id, donor2.id, donor3.id] } } });
      await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
    }
  });

  // Cleanup DB connections on script termination
  process.on('exit', () => {
    prisma.$disconnect().catch(() => {});
  });
})();
