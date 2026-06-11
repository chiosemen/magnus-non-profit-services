import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { PrismaClient } from '@magnus/db/types';
import {
  AuthRequiredError,
  FeatureNotEnabledError,
  InvalidTokenError,
  SubscriptionNotActiveError,
  requireFeature,
  type FeatureKey,
} from '@magnus/subscription';
import prisma from '@magnus/db/client';

export type SubscriptionGateOptions = {
  db?: PrismaClient;
  routeName?: string;
};

export function createSubscriptionGate(featureKey: FeatureKey, options: SubscriptionGateOptions = {}): RequestHandler {
  const db = options.db ?? (prisma as unknown as PrismaClient);
  const inner = requireFeature(featureKey, { db, preferAuthContext: true });
  const routeName = options.routeName ?? 'org-dashboard-api';

  return (req: Request, res: Response, next: NextFunction) => {
    return inner(req, res, (err?: unknown) => {
      if (!err) {
        next();
        return;
      }
      const mapped = mapSubscriptionError(err);
      auditSubscriptionDenial(req, {
        routeName,
        featureKey,
        decision: mapped.error,
        err,
      });
      res.status(mapped.status).json({ error: mapped.error });
    });
  };
}

function mapSubscriptionError(err: unknown): { status: number; error: string } {
  if (err instanceof AuthRequiredError) return { status: 401, error: 'AUTH_REQUIRED' };
  if (err instanceof InvalidTokenError) return { status: 401, error: 'AUTH_INVALID' };
  if (err instanceof SubscriptionNotActiveError) return { status: 403, error: 'SUBSCRIPTION_NOT_ACTIVE' };
  if (err instanceof FeatureNotEnabledError) return { status: 403, error: 'FEATURE_NOT_ENABLED' };
  return { status: 403, error: 'FEATURE_NOT_ENABLED' };
}

function auditSubscriptionDenial(
  req: Request,
  params: { routeName: string; featureKey: FeatureKey; decision: string; err: unknown },
): void {
  const err = params.err as SubscriptionDenialShape;
  const auth = (req as RequestWithAuth).auth ?? {};
  const headers = req.headers ?? {};
  const requestId = String(headers['x-request-id'] ?? headers['x-correlation-id'] ?? '');
  const event = {
    level: 'warn',
    type: 'subscription_access_denied',
    orgId: err.orgId ?? auth.orgId ?? null,
    subject: auth.sub ?? auth.workerId ?? null,
    route: params.routeName,
    requiredFeature: params.featureKey,
    tier: err.tier ?? null,
    status: err.subscriptionStatus ?? null,
    decision: params.decision,
    timestamp: new Date().toISOString(),
    requestId: requestId || null,
  };
  // eslint-disable-next-line no-console
  console.warn(JSON.stringify(event));
}

type SubscriptionDenialShape = {
  orgId?: string;
  tier?: string;
  subscriptionStatus?: string;
};

type RequestWithAuth = Request & {
  auth?: {
    orgId?: string;
    sub?: string;
    workerId?: string;
  };
};
