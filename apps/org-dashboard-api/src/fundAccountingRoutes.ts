import type { Express, RequestHandler } from 'express';
import prisma from '@magnus/db/client';
import type { PrismaClient } from '@magnus/db/types';
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
} from '@magnus/org-autonomous-ops-context';

export function registerFundAccountingRoutes(app: Express, jwtAuth: RequestHandler): void {
  const db = prisma as unknown as PrismaClient;

  const handleError = (err: any, res: any, next: any) => {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    if (err.name === 'NotFoundError') {
      return res.status(404).json({ error: err.message });
    }
    if (err.name === 'ForbiddenError') {
      return res.status(403).json({ error: err.message });
    }
    return next(err);
  };

  // ─── Funds ─────────────────────────────────────────────────────────────────

  app.post('/api/org/accounting/funds', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const { name, code, type, description } = req.body || {};
      const result = await createFund(db, orgId, { name, code, type, description });
      return res.status(201).json({ fund: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.get('/api/org/accounting/funds', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const result = await listFunds(db, orgId);
      return res.json({ funds: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.patch('/api/org/accounting/funds/:id', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const fundId = req.params.id;
      const { name, type, description } = req.body || {};
      const result = await updateFund(db, orgId, fundId, { name, type, description });
      return res.json({ fund: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  // ─── Accounts ──────────────────────────────────────────────────────────────

  app.post('/api/org/accounting/accounts', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const { name, code, type, parentId } = req.body || {};
      const result = await createAccount(db, orgId, { name, code, type, parentId });
      return res.status(201).json({ account: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.get('/api/org/accounting/accounts', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const result = await listAccounts(db, orgId);
      return res.json({ accounts: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.patch('/api/org/accounting/accounts/:id', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const accountId = req.params.id;
      const { name, parentId } = req.body || {};
      const result = await updateAccount(db, orgId, accountId, { name, parentId });
      return res.json({ account: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  // ─── Donation Allocations ──────────────────────────────────────────────────

  app.post('/api/org/accounting/allocations', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const { donationId, fundId, amount } = req.body || {};
      const result = await allocateDonation(db, orgId, { donationId, fundId, amount });
      return res.status(201).json({ allocation: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  // ─── Post Ledger Transaction ──────────────────────────────────────────────

  app.post('/api/org/accounting/transactions', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const { date, description, postedBy, approvedBy, lines } = req.body || {};
      const result = await postLedgerTransaction(db, orgId, { date, description, postedBy, approvedBy, lines });
      return res.status(201).json(result);
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  // ─── Reports ───────────────────────────────────────────────────────────────

  app.get('/api/org/accounting/reports/fund-balance', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const { startDate, endDate } = req.query as Record<string, string | undefined>;
      const result = await getFundBalanceReport(db, orgId, { startDate, endDate });
      return res.json({ report: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.get('/api/org/accounting/reports/income-expense', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const { startDate, endDate, fundId } = req.query as Record<string, string | undefined>;
      const result = await getIncomeExpenseReport(db, orgId, { startDate, endDate, fundId });
      return res.json({ report: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.get('/api/org/accounting/reports/board-summary', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const result = await getBoardFinancialSummary(db, orgId);
      return res.json({ summary: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });
}
