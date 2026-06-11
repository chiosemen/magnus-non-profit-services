import type { Express, RequestHandler } from 'express';
import prisma from '@magnus/db/client';
import type { PrismaClient } from '@magnus/db/types';
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
  getReceiptByDonationId,
  previewCsvImport,
  commitCsvImport,
} from '@magnus/org-autonomous-ops-context';

export function registerDonorCrmRoutes(app: Express, jwtAuth: RequestHandler): void {
  const db = prisma as unknown as PrismaClient;

  // ─── Donor Routes ──────────────────────────────────────────────────────────

  app.get('/api/org/donors', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const q = req.query as Record<string, string | undefined>;
      const takeRaw = q.take ? parseInt(q.take, 10) : 50;
      const skipRaw = q.skip ? parseInt(q.skip, 10) : 0;
      const search = q.search || undefined;

      const take = Number.isFinite(takeRaw) ? Math.min(500, Math.max(1, takeRaw)) : 50;
      const skip = Number.isFinite(skipRaw) ? Math.max(0, skipRaw) : 0;

      const donors = await listDonors(db, orgId, { take, skip, search });
      return res.json({ orgId, donors });
    } catch (err) {
      return next(err);
    }
  });

  app.post('/api/org/donors', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const body = req.body || {};

      if (!body.name || !body.name.trim()) {
        return res.status(400).json({ error: 'NAME_REQUIRED' });
      }

      const donor = await createDonor(db, orgId, {
        donorType: body.donorType,
        name: body.name,
        email: body.email,
        phone: body.phone,
        addressJson: body.addressJson,
      });

      return res.status(201).json({ donor });
    } catch (err: any) {
      if (err.message === 'INVALID_EMAIL' || err.message === 'INVALID_PHONE') {
        return res.status(400).json({ error: err.message });
      }
      if (err.message === 'DONOR_EMAIL_DUPLICATE') {
        return res.status(409).json({ error: err.message });
      }
      return next(err);
    }
  });

  app.put('/api/org/donors/:id', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const donorId = req.params.id;
      const body = req.body || {};

      const donor = await updateDonor(db, orgId, donorId, {
        name: body.name,
        email: body.email,
        phone: body.phone,
        addressJson: body.addressJson,
      });

      return res.json({ donor });
    } catch (err: any) {
      if (err.message === 'DONOR_NOT_FOUND') {
        return res.status(404).json({ error: err.message });
      }
      if (err.message === 'INVALID_EMAIL' || err.message === 'INVALID_PHONE' || err.message === 'NAME_REQUIRED') {
        return res.status(400).json({ error: err.message });
      }
      if (err.message === 'DONOR_EMAIL_DUPLICATE') {
        return res.status(409).json({ error: err.message });
      }
      return next(err);
    }
  });

  app.get('/api/org/donors/:id', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const donorId = req.params.id;

      const donor = await getDonorDetail(db, orgId, donorId);
      return res.json({ donor });
    } catch (err: any) {
      if (err.message === 'DONOR_NOT_FOUND') {
        return res.status(404).json({ error: err.message });
      }
      return next(err);
    }
  });

  // ─── Donation Routes ───────────────────────────────────────────────────────

  app.get('/api/org/donations', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const q = req.query as Record<string, string | undefined>;
      const takeRaw = q.take ? parseInt(q.take, 10) : 50;
      const skipRaw = q.skip ? parseInt(q.skip, 10) : 0;
      const donorId = q.donorId || undefined;

      const take = Number.isFinite(takeRaw) ? Math.min(500, Math.max(1, takeRaw)) : 50;
      const skip = Number.isFinite(skipRaw) ? Math.max(0, skipRaw) : 0;

      const donations = await listDonations(db, orgId, { take, skip, donorId });
      return res.json({ orgId, donations });
    } catch (err) {
      return next(err);
    }
  });

  app.post('/api/org/donations/manual', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const body = req.body || {};

      if (!body.donorId) {
        return res.status(400).json({ error: 'DONOR_ID_REQUIRED' });
      }
      if (typeof body.amount !== 'number' || body.amount <= 0) {
        return res.status(400).json({ error: 'INVALID_AMOUNT' });
      }
      if (!body.receivedAt) {
        return res.status(400).json({ error: 'RECEIVED_AT_REQUIRED' });
      }

      const receivedAt = new Date(body.receivedAt);
      if (Number.isNaN(receivedAt.getTime())) {
        return res.status(400).json({ error: 'INVALID_DATE' });
      }

      const donation = await createManualDonation(db, orgId, {
        donorId: body.donorId,
        amount: body.amount,
        currency: body.currency,
        receivedAt,
        paymentMethod: body.paymentMethod || 'MANUAL',
        referenceNumber: body.referenceNumber,
        notes: body.notes,
      });

      return res.status(201).json({ donation });
    } catch (err: any) {
      if (err.message === 'DONOR_NOT_FOUND') {
        return res.status(404).json({ error: err.message });
      }
      return next(err);
    }
  });

  // ─── Receipt Routes ────────────────────────────────────────────────────────

  app.post('/api/org/donations/:id/receipt', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const donationId = req.params.id;

      const receipt = await issueReceipt(db, orgId, donationId);
      return res.status(201).json({ receipt });
    } catch (err: any) {
      if (err.message === 'DONATION_NOT_FOUND') {
        return res.status(404).json({ error: err.message });
      }
      return next(err);
    }
  });

  app.get('/api/org/donations/:id/receipt', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const donationId = req.params.id;

      const receipt = await getReceiptByDonationId(db, orgId, donationId);
      return res.json({ receipt });
    } catch (err: any) {
      if (err.message === 'RECEIPT_NOT_FOUND') {
        return res.status(404).json({ error: err.message });
      }
      return next(err);
    }
  });

  app.get('/api/org/receipts/:id', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const receiptId = req.params.id;

      const receipt = await getReceiptMetadata(db, orgId, receiptId);
      return res.json({ receipt });
    } catch (err: any) {
      if (err.message === 'RECEIPT_NOT_FOUND') {
        return res.status(404).json({ error: err.message });
      }
      return next(err);
    }
  });

  app.post('/api/org/receipts/:id/void', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const receiptId = req.params.id;
      const body = req.body || {};

      if (!body.reason || !body.reason.trim()) {
        return res.status(400).json({ error: 'VOID_REASON_REQUIRED' });
      }

      const receipt = await voidReceipt(db, orgId, receiptId, body.reason);
      return res.json({ receipt });
    } catch (err: any) {
      if (err.message === 'RECEIPT_NOT_FOUND') {
        return res.status(404).json({ error: err.message });
      }
      return next(err);
    }
  });

  // ─── CSV Import Routes ─────────────────────────────────────────────────────

  app.post('/api/org/donors/import-preview', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const body = req.body || {};

      if (!body.csvContent || typeof body.csvContent !== 'string') {
        return res.status(400).json({ error: 'CSV_CONTENT_REQUIRED' });
      }

      const preview = previewCsvImport(orgId, body.csvContent);
      return res.json(preview);
    } catch (err) {
      return next(err);
    }
  });

  app.post('/api/org/donors/import-commit', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const body = req.body || {};

      if (!body.csvContent || typeof body.csvContent !== 'string') {
        return res.status(400).json({ error: 'CSV_CONTENT_REQUIRED' });
      }
      if (!body.fileName || typeof body.fileName !== 'string') {
        return res.status(400).json({ error: 'FILE_NAME_REQUIRED' });
      }

      const result = await commitCsvImport(db, orgId, body.csvContent, body.fileName);
      return res.status(201).json(result);
    } catch (err) {
      return next(err);
    }
  });
}
