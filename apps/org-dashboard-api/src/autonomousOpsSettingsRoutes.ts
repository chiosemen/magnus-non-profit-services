import type { Express, RequestHandler } from 'express';
import prisma from '@magnus/db/client';
import type { AutonomyTier, PrismaClient } from '@magnus/db/types';
import { AutonomousOpsSettingsService } from '@magnus/org-autonomous-ops-context';

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(x => typeof x === 'string');
}

function parseMaxTier(raw: unknown): AutonomyTier | undefined {
  if (raw === undefined) return undefined;
  if (raw === 'TIER_A_AUTONOMOUS' || raw === 'TIER_B_ASK_FIRST' || raw === 'TIER_C_NEVER') return raw;
  return undefined;
}

export function registerAutonomousOpsSettingsRoutes(app: Express, jwtAuth: RequestHandler): void {
  const svc = new AutonomousOpsSettingsService(prisma as unknown as PrismaClient);

  app.get('/api/org/autonomous-ops/settings', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const settings = await svc.get(orgId);
      return res.json({ orgId, settings });
    } catch (err) {
      if (err instanceof Error && err.message === 'ORG_NOT_FOUND') return res.status(404).json({ error: 'ORG_NOT_FOUND' });
      return next(err);
    }
  });

  app.put('/api/org/autonomous-ops/settings', jwtAuth, async (req, res, next) => {
    try {
      const orgId = (req as { auth?: { orgId: string } }).auth?.orgId as string;
      const b = req.body as Record<string, unknown>;
      if (!isStringArray(b.enabledAgents)) return res.status(400).json({ error: 'INVALID_ENABLED_AGENTS' });
      const maxTier = parseMaxTier(b.maxAutonomyTier);
      if (b.maxAutonomyTier !== undefined && !maxTier) return res.status(400).json({ error: 'INVALID_MAX_AUTONOMY_TIER' });

      const settings = await svc.upsert(orgId, {
        enabledAgents: b.enabledAgents,
        maxAutonomyTier: maxTier,
        agentBoundaryOverrides:
          b.agentBoundaryOverrides !== undefined && b.agentBoundaryOverrides !== null && typeof b.agentBoundaryOverrides === 'object' && !Array.isArray(b.agentBoundaryOverrides)
            ? (b.agentBoundaryOverrides as Record<string, any>)
            : undefined,
      });
      return res.json({ orgId, settings });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'ORG_NOT_FOUND') return res.status(404).json({ error: 'ORG_NOT_FOUND' });
        if (err.message === 'INVALID_ENABLED_AGENTS') return res.status(400).json({ error: 'INVALID_ENABLED_AGENTS' });
        if (err.message === 'INVALID_MAX_AUTONOMY_TIER') return res.status(400).json({ error: 'INVALID_MAX_AUTONOMY_TIER' });
        if (err.message === 'INVALID_BOUNDARY_OVERRIDES') return res.status(400).json({ error: 'INVALID_BOUNDARY_OVERRIDES' });
      }
      return next(err);
    }
  });
}

