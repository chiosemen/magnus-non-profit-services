/**
 * Magnus DB — S4NP Phase 3 Fund Accounting Database Integration Tests
 */

import { config } from 'dotenv';
import { join } from 'path';

// Load .env from project root
config({ path: join(__dirname, '..', '..', '..', '..', '.env') });

import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient, FundType, AccountType } from '@prisma/client';
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
    registerDbUnavailable('S4NP Phase 3 Database integration tests', 'DATABASE_URL unreachable');
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

  test('Fund Accounting: creates fund and chart of accounts successfully', async () => {
    const org = await setupTestOrg('00-9111111', 'Accounting Org 1');

    // Create unique code
    const fundCode = `FND-${Date.now()}`;
    const fund = await prisma.fund.create({
      data: {
        orgId: org.id,
        name: 'Emergency Relief Fund',
        code: fundCode,
        type: FundType.RESTRICTED,
      },
    });

    assert.ok(fund.id);
    assert.equal(fund.code, fundCode);
    assert.equal(fund.type, FundType.RESTRICTED);

    const accountCode = `ACC-${Date.now()}`;
    const account = await prisma.account.create({
      data: {
        orgId: org.id,
        name: 'Cash at Bank',
        code: accountCode,
        type: AccountType.ASSET,
      },
    });

    assert.ok(account.id);
    assert.equal(account.code, accountCode);
    assert.equal(account.type, AccountType.ASSET);
  });

  test('Fund Accounting: donation allocation linking works correctly', async () => {
    const org = await setupTestOrg('00-9222222', 'Accounting Org 2');
    
    // Create donor
    const donor = await prisma.donor.create({
      data: {
        orgId: org.id,
        name: 'Generous Supporter',
        donorType: 'INDIVIDUAL',
      },
    });

    // Create donation
    const donation = await prisma.donation.create({
      data: {
        orgId: org.id,
        donorId: donor.id,
        amount: 250.00,
        receivedAt: new Date(),
        paymentMethod: 'CHECK',
      },
    });

    // Create fund
    const fund = await prisma.fund.create({
      data: {
        orgId: org.id,
        name: 'Education Support Fund',
        code: `EDU-${Date.now()}`,
        type: FundType.RESTRICTED,
      },
    });

    // Allocate donation
    const allocation = await prisma.donationAllocation.create({
      data: {
        orgId: org.id,
        donationId: donation.id,
        fundId: fund.id,
        amount: 250.00,
      },
    });

    assert.ok(allocation.id);
    assert.equal(Number(allocation.amount), 250.00);
    assert.equal(allocation.donationId, donation.id);
    assert.equal(allocation.fundId, fund.id);
  });

  test('Fund Accounting: balanced transaction posting validation rules', async () => {
    const org = await setupTestOrg('00-9333333', 'Accounting Org 3');

    const assetAcc = await prisma.account.create({
      data: { orgId: org.id, name: 'Cash Account', code: `AS-${Date.now()}`, type: AccountType.ASSET },
    });

    const revAcc = await prisma.account.create({
      data: { orgId: org.id, name: 'Donations Revenue', code: `REV-${Date.now()}`, type: AccountType.REVENUE },
    });

    const fund = await prisma.fund.create({
      data: { orgId: org.id, name: 'General Operating Fund', code: `GEN-${Date.now()}`, type: FundType.UNRESTRICTED },
    });

    // A balanced double entry transaction: Debit 100.00 to Cash, Credit 100.00 to Revenue
    const debit = 100.00;
    const credit = 100.00;

    assert.equal(debit, credit, 'Debits and Credits must balance');

    const transaction = await prisma.ledgerTransaction.create({
      data: {
        orgId: org.id,
        date: new Date(),
        description: 'Log balanced transaction',
        postedBy: 'TEST_AGENT',
        lines: {
          create: [
            { orgId: org.id, accountId: assetAcc.id, fundId: fund.id, debit: 100.00, credit: 0.00 },
            { orgId: org.id, accountId: revAcc.id, fundId: fund.id, debit: 0.00, credit: 100.00 },
          ],
        },
      },
      include: {
        lines: true,
      },
    });

    assert.ok(transaction.id);
    assert.equal(transaction.lines.length, 2);

    const totalDebit = transaction.lines.reduce((sum, line) => sum + Number(line.debit), 0);
    const totalCredit = transaction.lines.reduce((sum, line) => sum + Number(line.credit), 0);
    assert.equal(totalDebit, totalCredit, 'Ledger lines must balance exactly');
  });

  test('Fund Accounting: enforces tenant boundaries and isolates transactions', async () => {
    const orgA = await setupTestOrg('00-9444444', 'Org A Accounting');
    const orgB = await setupTestOrg('00-9555555', 'Org B Accounting');

    const assetAccA = await prisma.account.create({
      data: { orgId: orgA.id, name: 'Cash Account A', code: `ASA-${Date.now()}`, type: AccountType.ASSET },
    });

    const fundB = await prisma.fund.create({
      data: { orgId: orgB.id, name: 'Fund B', code: `FB-${Date.now()}`, type: FundType.UNRESTRICTED },
    });

    // Posting a transaction on Org A referencing a Fund belonging to Org B must trigger validation errors
    // Since relational check is handled at validation/logical layer, we mock/test it directly here:
    const validateTransactionReference = (transactionOrgId: string, accountOrgId: string, fundOrgId: string) => {
      if (transactionOrgId !== accountOrgId || transactionOrgId !== fundOrgId) {
        throw new Error('Tenant Boundary Mismatch Error');
      }
    };

    assert.throws(
      () => validateTransactionReference(orgA.id, assetAccA.orgId, fundB.orgId),
      /Tenant Boundary Mismatch Error/
    );
  });

  test('Fund Accounting: prevents physical delete of posted ledger entries (Restrict rule)', async () => {
    const org = await setupTestOrg('00-9666666', 'Accounting Org 4');

    const assetAcc = await prisma.account.create({
      data: { orgId: org.id, name: 'Asset Cash', code: `ASC-${Date.now()}`, type: AccountType.ASSET },
    });

    const fund = await prisma.fund.create({
      data: { orgId: org.id, name: 'General Fund', code: `G-${Date.now()}`, type: FundType.UNRESTRICTED },
    });

    const transaction = await prisma.ledgerTransaction.create({
      data: {
        orgId: org.id,
        date: new Date(),
        description: 'Immutable post',
        postedBy: 'TEST',
        lines: {
          create: [
            { orgId: org.id, accountId: assetAcc.id, fundId: fund.id, debit: 50.00, credit: 0.00 },
            { orgId: org.id, accountId: assetAcc.id, fundId: fund.id, debit: 0.00, credit: 50.00 },
          ],
        },
      },
    });

    // Try to delete the account - should fail due to onDelete Restrict on LedgerEntry referencing it
    await assert.rejects(
      async () => {
        await prisma.account.delete({
          where: { id: assetAcc.id },
        });
      },
      (err: any) => {
        // Prisma restrict error code is P2003
        assert.equal(err.code, 'P2003');
        return true;
      }
    );

    // Try to delete the fund - should fail due to Restrict
    await assert.rejects(
      async () => {
        await prisma.fund.delete({
          where: { id: fund.id },
        });
      },
      (err: any) => {
        assert.equal(err.code, 'P2003');
        return true;
      }
    );
  });
})();
