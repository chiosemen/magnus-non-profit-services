import type { NextFunction, Request, Response } from 'express';
import type { PrismaClient, WorkerTier } from '@magnus/db/types';

export type RequiredWorkerAccess =
  | 'income_summary'
  | 'tax_estimate_basic'
  | 'income_optimizer_alerts'
  | 'compensation_benchmark'
  | 'volatility_analysis';

export function createWorkerTierGuard(db: PrismaClient) {
  return (required: RequiredWorkerAccess) => {
    return async (req: Request, res: Response, next: NextFunction) => {
      const workerId = (req as any).worker?.workerId as string | undefined;
      if (!workerId) {
        res.status(401).json({ error: 'WORKER_AUTH_REQUIRED' });
        return;
      }

      const worker = await db.worker.findUnique({
        where: { id: workerId },
        select: { workerTier: true },
      });
      if (!worker) {
        res.status(404).json({ error: 'WORKER_NOT_FOUND' });
        return;
      }

      const allowed = isAllowed(worker.workerTier, required);
      if (!allowed) {
        res.status(403).json({ error: 'WORKER_TIER_REQUIRED' });
        return;
      }

      next();
    };
  };
}

function isAllowed(tier: WorkerTier, required: RequiredWorkerAccess): boolean {
  const freeAllowed = required === 'income_summary' || required === 'tax_estimate_basic';
  if (tier === 'FREE') return freeAllowed;
  // PREMIUM: all features
  return true;
}

