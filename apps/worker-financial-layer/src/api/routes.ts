/**
 * Magnus Worker Financial Layer — API Routes
 *
 * PRODUCTION CONTRACT:
 * - These endpoints return real calculated financial data or 503 FEATURE_NOT_CONFIGURED.
 * - They MUST NOT return placeholder zeros, nulls, or empty arrays as truth claims.
 * - Until real calculations are wired from DB / Plaid, all financial endpoints
 *   return 503 FEATURE_NOT_CONFIGURED with an explicit onboarding action.
 * - Non-financial routes (health) are exempt from this contract.
 *
 * Activation path:
 * 1. Implement real calculation logic backed by DB / Plaid for each endpoint.
 * 2. Set FEATURE_FLAG_WORKER_FINANCIALS=true in env once calculations are verified.
 * 3. Remove the feature-flag guard from each handler.
 */

import { Router, type NextFunction, type Request, type Response } from 'express';
import type { PrismaClient } from '@magnus/db/types';
import { createJwtAuthMiddleware } from '@magnus/auth/jwtAuth';
import { createWorkerTierGuard } from '../middleware/workerTierGuard';

const WORKER_FINANCIALS_LIVE = process.env['FEATURE_FLAG_WORKER_FINANCIALS'] === 'true';

function featureNotConfigured(res: Response, feature: string): void {
  res.status(503).json({
    error: 'FEATURE_NOT_CONFIGURED',
    feature,
    message: `${feature} is not yet available. Real calculation logic must be implemented and verified before this endpoint returns data.`,
    onboarding_action: 'Contact support or complete Plaid onboarding to enable worker financial features.',
  });
}

export function buildRoutes(db: PrismaClient): Router {
  const router = Router();
  const tierGuard = createWorkerTierGuard(db);
  const jwtAuth = createJwtAuthMiddleware({ requireWorkerId: true });

  router.get('/health', (_req, res) => res.json({ ok: true }));

  // FREE: income summary
  router.get('/api/worker/income-summary', jwtAuth, tierGuard('income_summary'), asyncHandler(async (req, res) => {
    if (!WORKER_FINANCIALS_LIVE) {
      featureNotConfigured(res, 'income_summary');
      return;
    }
    // TODO: implement real calculation from DB / Plaid transactions
    const workerId = (req as any).auth.workerId as string;
    void workerId;
    res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'Real income summary calculation is not yet implemented.' });
  }));

  // FREE: basic tax estimate
  router.get('/api/worker/tax-estimate/basic', jwtAuth, tierGuard('tax_estimate_basic'), asyncHandler(async (req, res) => {
    if (!WORKER_FINANCIALS_LIVE) {
      featureNotConfigured(res, 'tax_estimate_basic');
      return;
    }
    const workerId = (req as any).auth.workerId as string;
    void workerId;
    res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'Real tax estimate calculation is not yet implemented.' });
  }));

  // PREMIUM: income optimizer alerts
  router.get('/api/worker/income-optimizer/alerts', jwtAuth, tierGuard('income_optimizer_alerts'), asyncHandler(async (req, res) => {
    if (!WORKER_FINANCIALS_LIVE) {
      featureNotConfigured(res, 'income_optimizer_alerts');
      return;
    }
    const workerId = (req as any).auth.workerId as string;
    void workerId;
    res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'Real income optimizer alerts are not yet implemented.' });
  }));

  // PREMIUM: compensation benchmark
  router.get('/api/worker/compensation-benchmark', jwtAuth, tierGuard('compensation_benchmark'), asyncHandler(async (req, res) => {
    if (!WORKER_FINANCIALS_LIVE) {
      featureNotConfigured(res, 'compensation_benchmark');
      return;
    }
    const workerId = (req as any).auth.workerId as string;
    void workerId;
    res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'Real compensation benchmark is not yet implemented.' });
  }));

  // PREMIUM: volatility analysis
  router.get('/api/worker/volatility-analysis', jwtAuth, tierGuard('volatility_analysis'), asyncHandler(async (req, res) => {
    if (!WORKER_FINANCIALS_LIVE) {
      featureNotConfigured(res, 'volatility_analysis');
      return;
    }
    const workerId = (req as any).auth.workerId as string;
    void workerId;
    res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'Real volatility analysis is not yet implemented.' });
  }));

  return router;
}

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
