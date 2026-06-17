import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { PrismaClient } from '@magnus/db/types';
import { prisma } from '@magnus/db/client';
import {
  AuthRequiredError,
  FeatureNotEnabledError,
  InvalidTokenError,
  SubscriptionNotActiveError,
  featureForMcpTool,
  requireFeature,
} from '@magnus/subscription';

export function mcpToolSubscriptionGate(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const toolName = typeof req.body?.toolName === 'string' ? req.body.toolName : '';
    if (!toolName) {
      next();
      return;
    }

    const featureKey = featureForMcpTool(toolName);
    if (!featureKey) {
      auditDenied(req, {
        toolName,
        requiredFeature: 'UNMAPPED',
        decision: 'FEATURE_NOT_ENABLED',
        err: null,
      });
      res.status(403).json({ error: 'FEATURE_NOT_ENABLED' });
      return;
    }

    const gate = requireFeature(featureKey, { db: prisma as unknown as PrismaClient, preferAuthContext: true });
    return gate(req, res, (err?: unknown) => {
      if (!err) {
        next();
        return;
      }
      const mapped = mapSubscriptionError(err);
      auditDenied(req, {
        toolName,
        requiredFeature: featureKey,
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

function auditDenied(
  req: Request,
  params: { toolName: string; requiredFeature: string; decision: string; err: unknown },
): void {
  const err = params.err as SubscriptionDenialShape | null;
  const auth = (req as RequestWithAuth).auth ?? {};
  const headers = req.headers ?? {};
  const requestId = String(headers['x-request-id'] ?? headers['x-correlation-id'] ?? '');
  const event = {
    level: 'warn',
    type: 'subscription_access_denied',
    orgId: err?.orgId ?? auth.orgId ?? null,
    subject: auth.sub ?? auth.workerId ?? null,
    route: '/tools/execute',
    toolName: params.toolName,
    requiredFeature: params.requiredFeature,
    tier: err?.tier ?? null,
    status: err?.subscriptionStatus ?? null,
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
