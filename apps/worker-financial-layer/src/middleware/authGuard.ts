import type { NextFunction, Request, Response } from 'express';

export type WorkerAuthContext = { workerId: string };

// Fail-closed auth guard: this layer is worker-scoped.
// Replace with JWT/session later; for now requires x-worker-id header.
export function authGuard(req: Request, res: Response, next: NextFunction): void {
  const workerId = req.header('x-worker-id');
  if (!workerId) {
    res.status(401).json({ error: 'WORKER_ID_REQUIRED' });
    return;
  }
  (req as any).worker = { workerId } satisfies WorkerAuthContext;
  next();
}

