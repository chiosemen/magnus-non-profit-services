import { Router, type NextFunction, type Request, type Response } from 'express';
import type { PrismaClient } from '@magnus/db/types';
import { createJwtAuthMiddleware } from '@magnus/auth/jwtAuth';
import { requireFeature } from '@magnus/subscription';
import { createWorkerTierGuard } from '../middleware/workerTierGuard';

export function buildRoutes(db: PrismaClient): Router {
  const router = Router();
  const tierGuard = createWorkerTierGuard(db);
  const jwtAuth = createJwtAuthMiddleware({ requireWorkerId: true });
  const requireWorkerLayer = requireFeature('worker_financial_layer');

  router.get('/health', (_req, res) => res.json({ ok: true }));

  // FREE: income summary
  router.get('/api/worker/income-summary', jwtAuth, requireWorkerLayer, tierGuard('income_summary'), asyncHandler(async (req, res) => {
    const workerId = (req as any).auth.workerId as string;
    res.json({ workerId, incomeSummary: { total90d: 0 } });
  }));

  // FREE: basic tax estimate
  router.get('/api/worker/tax-estimate/basic', jwtAuth, requireWorkerLayer, tierGuard('tax_estimate_basic'), asyncHandler(async (req, res) => {
    const workerId = (req as any).auth.workerId as string;
    res.json({ workerId, taxEstimate: { federal: 0, state: 0 } });
  }));

  // PREMIUM: income optimizer alerts
  router.get('/api/worker/income-optimizer/alerts', jwtAuth, requireWorkerLayer, tierGuard('income_optimizer_alerts'), asyncHandler(async (req, res) => {
    const workerId = (req as any).auth.workerId as string;
    res.json({ workerId, alerts: [] });
  }));

  // PREMIUM: compensation benchmark
  router.get('/api/worker/compensation-benchmark', jwtAuth, requireWorkerLayer, tierGuard('compensation_benchmark'), asyncHandler(async (req, res) => {
    const workerId = (req as any).auth.workerId as string;
    res.json({ workerId, benchmark: null });
  }));

  // PREMIUM: volatility analysis
  router.get('/api/worker/volatility-analysis', jwtAuth, requireWorkerLayer, tierGuard('volatility_analysis'), asyncHandler(async (req, res) => {
    const workerId = (req as any).auth.workerId as string;
    res.json({ workerId, volatility: null });
  }));

  return router;
}

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
