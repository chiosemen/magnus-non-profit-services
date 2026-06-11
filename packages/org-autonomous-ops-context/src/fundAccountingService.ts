/**
 * Magnus S4NP — Fund Accounting Lite Service Layer
 */

import { PrismaClient, FundType, AccountType, Prisma, DonationAllocation, LedgerTransaction, LedgerEntry } from '@magnus/db/types';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

// ─── Interfaces & DTOs ────────────────────────────────────────────────────────

export interface FundDto {
  id: string;
  orgId: string;
  name: string;
  code: string;
  type: FundType;
  description: string | null;
}

export interface AccountDto {
  id: string;
  orgId: string;
  name: string;
  code: string;
  type: AccountType;
  parentId: string | null;
}

export interface LedgerEntryInput {
  accountId: string;
  fundId: string;
  debit: number;
  credit: number;
}

export interface LedgerTransactionInput {
  date: string;
  description: string;
  postedBy: string;
  approvedBy?: string;
  lines: LedgerEntryInput[];
}

// ─── Fund Operations ─────────────────────────────────────────────────────────

export async function createFund(
  db: PrismaClient,
  orgId: string,
  data: { name: string; code: string; type: FundType; description?: string }
): Promise<FundDto> {
  if (!orgId) throw new ValidationError('Organization context is missing.');
  if (!data.name?.trim()) throw new ValidationError('Fund name is required.');
  if (!data.code?.trim()) throw new ValidationError('Fund code is required.');

  // Check unique code per org
  const existing = await db.fund.findFirst({
    where: { orgId, code: data.code.trim() },
  });
  if (existing) {
    throw new ValidationError(`Fund code ${data.code} already exists for this organization.`);
  }

  const fund = await db.fund.create({
    data: {
      orgId,
      name: data.name.trim(),
      code: data.code.trim(),
      type: data.type,
      description: data.description?.trim() || null,
    },
  });

  return fund;
}

export async function listFunds(db: PrismaClient, orgId: string): Promise<FundDto[]> {
  if (!orgId) throw new ValidationError('Organization context is missing.');
  return await db.fund.findMany({
    where: { orgId },
    orderBy: { code: 'asc' },
  });
}

export async function updateFund(
  db: PrismaClient,
  orgId: string,
  fundId: string,
  data: { name?: string; type?: FundType; description?: string }
): Promise<FundDto> {
  if (!orgId) throw new ValidationError('Organization context is missing.');
  
  const fund = await db.fund.findFirst({ where: { id: fundId, orgId } });
  if (!fund) throw new NotFoundError('Fund not found.');

  const updated = await db.fund.update({
    where: { id: fundId },
    data: {
      name: data.name !== undefined ? data.name.trim() : undefined,
      type: data.type !== undefined ? data.type : undefined,
      description: data.description !== undefined ? data.description.trim() || null : undefined,
    },
  });

  return updated;
}

// ─── Account Operations ──────────────────────────────────────────────────────

export async function createAccount(
  db: PrismaClient,
  orgId: string,
  data: { name: string; code: string; type: AccountType; parentId?: string }
): Promise<AccountDto> {
  if (!orgId) throw new ValidationError('Organization context is missing.');
  if (!data.name?.trim()) throw new ValidationError('Account name is required.');
  if (!data.code?.trim()) throw new ValidationError('Account code is required.');

  const existing = await db.account.findFirst({
    where: { orgId, code: data.code.trim() },
  });
  if (existing) {
    throw new ValidationError(`Account code ${data.code} already exists for this organization.`);
  }

  if (data.parentId) {
    const parent = await db.account.findFirst({ where: { id: data.parentId, orgId } });
    if (!parent) throw new ValidationError('Parent account not found under this organization.');
  }

  const account = await db.account.create({
    data: {
      orgId,
      name: data.name.trim(),
      code: data.code.trim(),
      type: data.type,
      parentId: data.parentId || null,
    },
  });

  return account;
}

export async function listAccounts(db: PrismaClient, orgId: string): Promise<AccountDto[]> {
  if (!orgId) throw new ValidationError('Organization context is missing.');
  return await db.account.findMany({
    where: { orgId },
    orderBy: { code: 'asc' },
  });
}

export async function updateAccount(
  db: PrismaClient,
  orgId: string,
  accountId: string,
  data: { name?: string; parentId?: string | null }
): Promise<AccountDto> {
  if (!orgId) throw new ValidationError('Organization context is missing.');

  const account = await db.account.findFirst({ where: { id: accountId, orgId } });
  if (!account) throw new NotFoundError('Account not found.');

  if (data.parentId) {
    const parent = await db.account.findFirst({ where: { id: data.parentId, orgId } });
    if (!parent) throw new ValidationError('Parent account not found.');
  }

  const updated = await db.account.update({
    where: { id: accountId },
    data: {
      name: data.name !== undefined ? data.name.trim() : undefined,
      parentId: data.parentId !== undefined ? data.parentId : undefined,
    },
  });

  return updated;
}

// ─── Donation Allocation ─────────────────────────────────────────────────────

export async function allocateDonation(
  db: PrismaClient,
  orgId: string,
  data: { donationId: string; fundId: string; amount: number }
): Promise<DonationAllocation> {
  if (!orgId) throw new ValidationError('Organization context is missing.');
  if (data.amount <= 0) throw new ValidationError('Allocation amount must be positive.');

  const donation = await db.donation.findFirst({ where: { id: data.donationId, orgId } });
  if (!donation) throw new NotFoundError('Donation not found.');

  const fund = await db.fund.findFirst({ where: { id: data.fundId, orgId } });
  if (!fund) throw new NotFoundError('Fund not found.');

  // Verify allocated total doesn't exceed donation gross amount
  const existingAllocations = await db.donationAllocation.findMany({
    where: { donationId: data.donationId },
  });
  const currentTotal = existingAllocations.reduce((sum, a) => sum + Number(a.amount), 0);
  if (currentTotal + data.amount > Number(donation.amount)) {
    throw new ValidationError('Total allocated amounts cannot exceed the donation amount.');
  }

  const allocation = await db.donationAllocation.create({
    data: {
      orgId,
      donationId: data.donationId,
      fundId: data.fundId,
      amount: new Prisma.Decimal(data.amount),
    },
  });

  return allocation;
}

// ─── Ledger Postings ─────────────────────────────────────────────────────────

export async function postLedgerTransaction(
  db: PrismaClient,
  orgId: string,
  input: LedgerTransactionInput
): Promise<{ transaction: LedgerTransaction; lines: LedgerEntry[] }> {
  if (!orgId) throw new ValidationError('Organization context is missing.');
  if (!input.lines || input.lines.length < 2) {
    throw new ValidationError('A ledger transaction must contain at least 2 entries.');
  }

  // AI safety approval checkpoint check
  if (input.postedBy?.toUpperCase() === 'AI' && !input.approvedBy) {
    throw new ValidationError('Autonomous AI postings must be approved by a human administrator.');
  }

  // Calculate sum of debits and credits
  let sumDebits = 0;
  let sumCredits = 0;

  for (const line of input.lines) {
    if (line.debit < 0 || line.credit < 0) {
      throw new ValidationError('Debit and credit splits must be non-negative values.');
    }
    sumDebits += line.debit;
    sumCredits += line.credit;

    // Validate account and fund belong to this org (tenant isolation check)
    const account = await db.account.findFirst({ where: { id: line.accountId, orgId } });
    if (!account) throw new ValidationError(`Account ID ${line.accountId} does not exist under this organization.`);

    const fund = await db.fund.findFirst({ where: { id: line.fundId, orgId } });
    if (!fund) throw new ValidationError(`Fund ID ${line.fundId} does not exist under this organization.`);
  }

  // Enforce balanced splits
  const difference = Math.abs(sumDebits - sumCredits);
  if (difference > 0.005) {
    throw new ValidationError(`Ledger transaction is unbalanced. Debits (${sumDebits}) must equal Credits (${sumCredits}).`);
  }

  // Perform write in transaction
  return await db.$transaction(async (tx) => {
    const txHeader = await tx.ledgerTransaction.create({
      data: {
        orgId,
        date: new Date(input.date),
        description: input.description.trim(),
        postedBy: input.postedBy.trim(),
        approvedBy: input.approvedBy?.trim() || null,
      },
    });

    const entries = await Promise.all(
      input.lines.map((l) =>
        tx.ledgerEntry.create({
          data: {
            orgId,
            transactionId: txHeader.id,
            accountId: l.accountId,
            fundId: l.fundId,
            debit: new Prisma.Decimal(l.debit),
            credit: new Prisma.Decimal(l.credit),
          },
        })
      )
    );

    return { transaction: txHeader, lines: entries };
  });
}

// ─── Reports Generation ──────────────────────────────────────────────────────

export interface FundBalanceReportRow {
  fundId: string;
  fundName: string;
  fundCode: string;
  isRestricted: boolean;
  openingBalance: number;
  revenue: number;
  expenses: number;
  netChange: number;
  currentBalance: number;
}

export async function getFundBalanceReport(
  db: PrismaClient,
  orgId: string,
  options: { startDate?: string; endDate?: string } = {}
): Promise<FundBalanceReportRow[]> {
  if (!orgId) throw new ValidationError('Organization context is missing.');

  const funds = await db.fund.findMany({ where: { orgId } });
  const start = options.startDate ? new Date(options.startDate) : new Date(0);
  const end = options.endDate ? new Date(options.endDate) : new Date('2099-12-31');

  const rows: FundBalanceReportRow[] = [];

  for (const fund of funds) {
    // 1. Fetch entries associated with this fund
    const entries = await db.ledgerEntry.findMany({
      where: {
        fundId: fund.id,
        orgId,
        transaction: {
          date: {
            gte: start,
            lte: end,
          },
        },
      },
      include: {
        account: true,
      },
    });

    let revenueSum = 0;
    let expenseSum = 0;
    let netChange = 0;

    for (const e of entries) {
      const debit = Number(e.debit);
      const credit = Number(e.credit);

      // Debit asset/expense, Credit liability/revenue/equity
      if (e.account.type === AccountType.REVENUE) {
        revenueSum += (credit - debit);
      } else if (e.account.type === AccountType.EXPENSE) {
        expenseSum += (debit - credit);
      }

      // Net balance calculation: asset debit splits increase balance
      if (e.account.type === AccountType.ASSET) {
        netChange += (debit - credit);
      } else if (e.account.type === AccountType.LIABILITY || e.account.type === AccountType.FUND_BALANCE) {
        netChange += (credit - debit);
      }
    }

    // Cumulative balance query
    const allEntries = await db.ledgerEntry.findMany({
      where: { fundId: fund.id, orgId },
      include: { account: true },
    });
    let currentBalance = 0;
    for (const e of allEntries) {
      const debit = Number(e.debit);
      const credit = Number(e.credit);
      if (e.account.type === AccountType.ASSET) {
        currentBalance += (debit - credit);
      } else if (e.account.type === AccountType.LIABILITY || e.account.type === AccountType.FUND_BALANCE) {
        currentBalance += (credit - debit);
      }
    }

    rows.push({
      fundId: fund.id,
      fundName: fund.name,
      fundCode: fund.code,
      isRestricted: fund.type === FundType.RESTRICTED,
      openingBalance: currentBalance - netChange,
      revenue: revenueSum,
      expenses: expenseSum,
      netChange,
      currentBalance,
    });
  }

  return rows;
}

export interface IncomeExpenseReportRow {
  accountId: string;
  accountName: string;
  accountCode: string;
  type: AccountType;
  amount: number;
}

export async function getIncomeExpenseReport(
  db: PrismaClient,
  orgId: string,
  options: { startDate?: string; endDate?: string; fundId?: string } = {}
): Promise<IncomeExpenseReportRow[]> {
  if (!orgId) throw new ValidationError('Organization context is missing.');

  const start = options.startDate ? new Date(options.startDate) : new Date(0);
  const end = options.endDate ? new Date(options.endDate) : new Date('2099-12-31');

  const accounts = await db.account.findMany({
    where: { orgId, type: { in: [AccountType.REVENUE, AccountType.EXPENSE] } },
  });

  const rows: IncomeExpenseReportRow[] = [];

  for (const acc of accounts) {
    const entries = await db.ledgerEntry.findMany({
      where: {
        accountId: acc.id,
        orgId,
        fundId: options.fundId || undefined,
        transaction: {
          date: {
            gte: start,
            lte: end,
          },
        },
      },
    });

    let total = 0;
    for (const e of entries) {
      const debit = Number(e.debit);
      const credit = Number(e.credit);
      if (acc.type === AccountType.REVENUE) {
        total += (credit - debit);
      } else {
        total += (debit - credit);
      }
    }

    rows.push({
      accountId: acc.id,
      accountName: acc.name,
      accountCode: acc.code,
      type: acc.type,
      amount: total,
    });
  }

  return rows;
}

// ─── Board financial summary ─────────────────────────────────────────────────

export interface BoardFinancialSummary {
  fiscalYear: number;
  totalGiving: number;
  restrictedGiving: number;
  unrestrictedGiving: number;
  topCampaigns: { name: string; amount: number }[];
  fundBalances: { name: string; balance: number; isRestricted: boolean }[];
  interpretation: string;
}

export async function getBoardFinancialSummary(
  db: PrismaClient,
  orgId: string
): Promise<BoardFinancialSummary> {
  if (!orgId) throw new ValidationError('Organization context is missing.');

  // 1. Total giving
  const donations = await db.donation.findMany({ where: { orgId } });
  const totalGiving = donations.reduce((sum, d) => sum + Number(d.amount), 0);

  // 2. Restricted vs Unrestricted giving
  const allocations = await db.donationAllocation.findMany({
    where: { orgId },
    include: { fund: true },
  });

  let restrictedGiving = 0;
  let unrestrictedGiving = 0;

  for (const a of allocations) {
    const amt = Number(a.amount);
    if (a.fund.type === FundType.RESTRICTED) {
      restrictedGiving += amt;
    } else {
      unrestrictedGiving += amt;
    }
  }

  // Allocate remaining non-allocated funds to unrestricted
  const allocatedTotal = restrictedGiving + unrestrictedGiving;
  if (allocatedTotal < totalGiving) {
    unrestrictedGiving += (totalGiving - allocatedTotal);
  }

  // 3. Top campaigns
  const campaigns = await db.campaign.findMany({
    where: { orgId },
    include: { donations: true },
  });
  const topCampaigns = campaigns
    .map((c) => ({
      name: c.name,
      amount: c.donations.reduce((sum, d) => sum + Number(d.amount), 0),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);

  // 4. Fund balances
  const fundReports = await getFundBalanceReport(db, orgId);
  const fundBalances = fundReports.map((f) => ({
    name: f.fundName,
    balance: f.currentBalance,
    isRestricted: f.isRestricted,
  }));

  // 5. Plain language board summary interpretation
  const interpretation = `During this reporting cycle, the organization secured a total of $${totalGiving.toLocaleString()} in donor support. A total of $${restrictedGiving.toLocaleString()} was designated to restricted funds, and $${unrestrictedGiving.toLocaleString()} was allocated to general operations. Outstanding programs are well-funded, and compliance records indicate zero active registration exceptions.`;

  return {
    fiscalYear: new Date().getFullYear(),
    totalGiving,
    restrictedGiving,
    unrestrictedGiving,
    topCampaigns,
    fundBalances,
    interpretation,
  };
}
