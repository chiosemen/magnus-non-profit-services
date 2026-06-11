import type { Express, RequestHandler } from 'express';
import prisma from '@magnus/db/client';
import type { PrismaClient } from '@magnus/db/types';
import {
  analyzeLegacyCsvMapping,
  suggestDonorSegmentation,
  generateCampaignDraft,
  generateBoardBriefDraft,
  suggestComplianceReminders,
  listProposals,
  updateProposalStatus,
  applyProposal,
  createCampaign,
} from '@magnus/org-autonomous-ops-context';

export function registerConciergeRoutes(app: Express, jwtAuth: RequestHandler): void {
  const db = prisma as unknown as PrismaClient;

  const handleError = (err: any, res: any, next: any) => {
    if (
      err.name === 'ValidationError' ||
      err.name === 'AiConfigError' ||
      err.name === 'SecurityError'
    ) {
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

  // ─── CSV Import Mapping ────────────────────────────────────────────────────
  app.post('/api/org/concierge/csv-mapping', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const { headers, sampleRows } = req.body || {};
      if (!Array.isArray(headers) || !Array.isArray(sampleRows)) {
        return res.status(400).json({ error: 'Headers and sample rows are required arrays.' });
      }
      const result = await analyzeLegacyCsvMapping(db, orgId, headers, sampleRows);
      return res.status(201).json({ proposal: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  // ─── Donor Segmentation Suggestions ────────────────────────────────────────
  app.post('/api/org/concierge/segmentation', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const result = await suggestDonorSegmentation(db, orgId);
      return res.status(201).json({ proposal: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  // ─── Campaign Draft Generation ─────────────────────────────────────────────
  app.post('/api/org/concierge/campaign-draft', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const { goalTopic } = req.body || {};
      if (!goalTopic) {
        return res.status(400).json({ error: 'Goal topic is required.' });
      }
      const result = await generateCampaignDraft(db, orgId, goalTopic);
      return res.status(201).json({ proposal: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  // ─── Board Brief Draft Generation ──────────────────────────────────────────
  app.post('/api/org/concierge/board-brief', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const result = await generateBoardBriefDraft(db, orgId);
      return res.status(201).json({ proposal: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  // ─── Compliance Reminder Suggestions ───────────────────────────────────────
  app.post('/api/org/concierge/compliance', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const result = await suggestComplianceReminders(db, orgId);
      return res.status(201).json({ proposal: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  // ─── Proposal Management ───────────────────────────────────────────────────
  app.get('/api/org/concierge/proposals', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const { status, type } = req.query as Record<string, any>;
      const result = await listProposals(db, orgId, { status, type });
      return res.json({ proposals: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.patch('/api/org/concierge/proposals/:id/status', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const proposalId = req.params.id;
      const { status, actorName } = req.body || {};
      const result = await updateProposalStatus(db, orgId, proposalId, status, actorName);
      return res.json({ proposal: result });
    } catch (err) {
      return handleError(err, res, next);
    }
  });

  app.post('/api/org/concierge/proposals/:id/apply', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as any).auth.orgId as string;
      const proposalId = req.params.id;
      const { actorName } = req.body || {};

      // Retrieve proposal to determine execution mapping logic
      const proposal = await db.conciergeProposal.findFirst({
        where: { id: proposalId, orgId }
      });

      if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found.' });
      }

      // Action Dispatcher: safe execution of approved actions depending on proposal type
      const executorFn = async (payload: any) => {
        if (proposal.type === 'CAMPAIGN_DRAFT') {
          // Creates actual campaign record
          const slug = (payload.title || 'campaign')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') + '-' + Date.now();
          return await createCampaign(db, orgId, {
            name: payload.title,
            slug,
            description: payload.story,
            goalAmount: payload.suggestedAmounts?.[0] || 1000
          });
        }
        // General fallback placeholder
        return { success: true, appliedType: proposal.type };
      };

      const result = await applyProposal(db, orgId, proposalId, executorFn, actorName);
      return res.json(result);
    } catch (err) {
      return handleError(err, res, next);
    }
  });
}
