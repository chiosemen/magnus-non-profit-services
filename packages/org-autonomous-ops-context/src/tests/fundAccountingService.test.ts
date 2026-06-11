/**
 * Magnus S4NP — Fund Accounting Lite Service Layer Integration & Validation Tests
 */

// Load .env from project root dynamically at runtime to bypass ts compile checks
if (typeof require !== 'undefined') {
  try {
    const path = require('path');
    require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });
  } catch (e) {}
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient, FundType, AccountType } from '@magnus/db/types';
import {
  createFund,
  listFunds,
  updateFund,
  createAccount,
  listAccounts,
  updateAccount,
  allocateDonation,
  postLedgerTransaction,
  getFundBalanceReport,
  getIncomeExpenseReport,
  getBoardFinancialSummary,
} from '../fundAccountingService';

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
    test('SKIP: S4NP Phase 3 Service tests (no DB connection)', { skip: 'DATABASE_URL unreachable' }, () => {});
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

  test('Fund Accounting Service: CRUD operations', async () => {
    const org = await setupTestOrg('00-7111111', 'Service Org 1');

    // 1. Funds CRUD
    const fundCode = `FD-${Date.now()}`;
    const fund = await createFund(prisma, org.id, {
      name: 'Scholarship Fund',
      code: fundCode,
      type: FundType.RESTRICTED,
      description: 'restricted to educational aid',
    });
    assert.equal(fund.name, 'Scholarship Fund');
    assert.equal(fund.code, fundCode);

    const listF = await listFunds(prisma, org.id);
    assert.ok(listF.some(f => f.id === fund.id));

    const updatedF = await updateFund(prisma, org.id, fund.id, { name: 'Scholarship Fund Modified' });
    assert.equal(updatedF.name, 'Scholarship Fund Modified');

    // 2. Accounts CRUD
    const accCode = `AC-${Date.now()}`;
    const account = await createAccount(prisma, org.id, {
      name: 'Program Expenses',
      code: accCode,
      type: AccountType.EXPENSE,
    });
    assert.equal(account.name, 'Program Expenses');
    assert.equal(account.type, AccountType.EXPENSE);

    const listA = await listAccounts(prisma, org.id);
    assert.ok(listA.some(a => a.id === account.id));

    const updatedA = await updateAccount(prisma, org.id, account.id, { name: 'Program Expenses Modified' });
    assert.equal(updatedA.name, 'Program Expenses Modified');
  });

  test('Fund Accounting Service: unbalanced ledger postings must be rejected', async () => {
    const org = await setupTestOrg('00-7222222', 'Service Org 2');

    const assetAcc = await createAccount(prisma, org.id, { name: 'Cash', code: `CS-${Date.now()}`, type: AccountType.ASSET });
    const revAcc = await createAccount(prisma, org.id, { name: 'Rev', code: `RV-${Date.now()}`, type: AccountType.REVENUE });
    const fund = await createFund(prisma, org.id, { name: 'Gen', code: `GN-${Date.now()}`, type: FundType.UNRESTRICTED });

    // Unbalanced entries: Debit 100, Credit 90
    await assert.rejects(
      () => postLedgerTransaction(prisma, org.id, {
        date: new Date().toISOString(),
        description: 'unbalanced posting attempt',
        postedBy: 'TEST',
        lines: [
          { accountId: assetAcc.id, fundId: fund.id, debit: 100.00, credit: 0.00 },
          { accountId: revAcc.id, fundId: fund.id, debit: 0.00, credit: 90.00 },
        ],
      }),
      (err: any) => {
        assert.ok(err.message.includes('unbalanced'));
        return true;
      }
    );
  });

  test('Fund Accounting Service: reports date/fund filtering and tenant isolation', async () => {
    const orgA = await setupTestOrg('00-7333333', 'Service Org A');
    const orgB = await setupTestOrg('00-7444444', 'Service Org B');

    // Setup accounts & funds for Org A
    const assetAccA = await createAccount(prisma, orgA.id, { name: 'Cash A', code: `CSA-${Date.now()}`, type: AccountType.ASSET });
    const revAccA = await createAccount(prisma, orgA.id, { name: 'Revenue A', code: `RVA-${Date.now()}`, type: AccountType.REVENUE });
    const fundA = await createFund(prisma, orgA.id, { name: 'Fund A', code: `FDA-${Date.now()}`, type: FundType.RESTRICTED });

    // Post transaction for Org A on 2026-05-01
    await postLedgerTransaction(prisma, orgA.id, {
      date: '2026-05-01T12:00:00Z',
      description: 'Revenue Allocation',
      postedBy: 'TEST',
      lines: [
        { accountId: assetAccA.id, fundId: fundA.id, debit: 500.00, credit: 0.00 },
        { accountId: revAccA.id, fundId: fundA.id, debit: 0.00, credit: 500.00 },
      ],
    });

    // Post transaction for Org A outside date range (e.g. 2026-06-01)
    await postLedgerTransaction(prisma, orgA.id, {
      date: '2026-06-01T12:00:00Z',
      description: 'Future Revenue Allocation',
      postedBy: 'TEST',
      lines: [
        { accountId: assetAccA.id, fundId: fundA.id, debit: 300.00, credit: 0.00 },
        { accountId: revAccA.id, fundId: fundA.id, debit: 0.00, credit: 300.00 },
      ],
    });

    // 1. Report without filters (totals should accumulate both: 500 + 300 = 800)
    const reportFull = await getFundBalanceReport(prisma, orgA.id);
    const fundRow = reportFull.find(r => r.fundId === fundA.id);
    assert.ok(fundRow);
    assert.equal(fundRow.currentBalance, 800.00);

    // 2. Report with date filter (should only include 2026-05-01 transaction: 500.00)
    const reportFiltered = await getFundBalanceReport(prisma, orgA.id, {
      startDate: '2026-04-30T00:00:00Z',
      endDate: '2026-05-15T00:00:00Z',
    });
    const fundRowFiltered = reportFiltered.find(r => r.fundId === fundA.id);
    assert.ok(fundRowFiltered);
    assert.equal(fundRowFiltered.revenue, 500.00);

    // 3. Tenant Isolation Check: Org B must not see Org A's balances
    const reportB = await getFundBalanceReport(prisma, orgB.id);
    assert.ok(!reportB.some(r => r.fundId === fundA.id));
  });

  test('Fund Accounting Service: board summary generation output validation', async () => {
    const org = await setupTestOrg('00-7555555', 'Service Org 5');

    // Clean up any historical donations and allocations for this test org to keep tests deterministic
    await prisma.donationAllocation.deleteMany({ where: { orgId: org.id } });
    await prisma.donation.deleteMany({ where: { orgId: org.id } });
    await prisma.campaign.deleteMany({ where: { orgId: org.id } });
    await prisma.donor.deleteMany({ where: { orgId: org.id } });
    await prisma.fund.deleteMany({ where: { orgId: org.id } });

    // Create donor, donation, campaign, fund, and allocations
    const donor = await prisma.donor.create({
      data: { orgId: org.id, name: 'Major Donor', donorType: 'INDIVIDUAL' },
    });

    const campaign = await prisma.campaign.create({
      data: { orgId: org.id, title: 'Winter Aid', slug: `winter-aid-${Date.now()}` },
    });

    const donation = await prisma.donation.create({
      data: {
        orgId: org.id,
        donorId: donor.id,
        campaignId: campaign.id,
        amount: 1500.00,
        receivedAt: new Date(),
        paymentMethod: 'CHECK',
      },
    });

    const fund = await createFund(prisma, org.id, { name: 'Winter Fund', code: `WN-${Date.now()}`, type: FundType.RESTRICTED });
    await allocateDonation(prisma, org.id, { donationId: donation.id, fundId: fund.id, amount: 1000.00 });

    const summary = await getBoardFinancialSummary(prisma, org.id);
    assert.equal(summary.totalGiving, 1500.00);
    assert.equal(summary.restrictedGiving, 1000.00);
    assert.equal(summary.unrestrictedGiving, 500.00); // 1500 - 1000 = 500 general allocation
    assert.equal(summary.topCampaigns[0].name, 'Winter Aid');
    assert.ok(summary.interpretation.includes('Major Donor') || summary.interpretation.includes('$1,500'));
  });
})();
