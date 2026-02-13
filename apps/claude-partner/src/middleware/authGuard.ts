import type { NextFunction, Request, Response } from 'express';

export type OrgAuthContext = { orgId: string };

export function authGuard(req: Request, res: Response, next: NextFunction): void {
  const orgId = req.header('x-org-id');
  if (!orgId) {
    res.status(401).json({ error: 'ORG_ID_REQUIRED' });
    return;
  }

  // Attach org context for handlers.
  (req as any).org = { orgId } satisfies OrgAuthContext;
  next();
}

