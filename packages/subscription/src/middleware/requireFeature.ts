import jwt from 'jsonwebtoken';
import { prisma } from '@magnus/db/client';
import type { PrismaClient } from '@magnus/db/types';
import type { FeatureKey } from '../features';
import { FeatureNotEnabledError, AuthRequiredError, InvalidTokenError, SubscriptionNotActiveError } from '../errors';
import { isFeatureEnabled } from '../policy';

export type RequireFeatureOptions = {
  db?: PrismaClient;
  jwtSecret?: string;
  jwtIssuer?: string;
  jwtAudience?: string;
  preferAuthContext?: boolean;
};

type JwtOrgPayload = {
  orgId?: string;
  sub?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  aud?: string | string[];
};

// Framework-agnostic middleware signature (compatible with Express).
export function requireFeature(featureKey: FeatureKey, opts: RequireFeatureOptions = {}) {
  const db = opts.db ?? prisma;
  const secret = opts.jwtSecret ?? process.env['JWT_SECRET'];
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters');
  }
  const issuer = opts.jwtIssuer ?? process.env['JWT_ISSUER'];
  const audience = opts.jwtAudience ?? process.env['JWT_AUDIENCE'];
  const preferAuthContext = opts.preferAuthContext ?? true;

  return async (req: any, _res: any, next: (err?: unknown) => void) => {
    try {
      const authContextOrgId = preferAuthContext && typeof req?.auth?.orgId === 'string'
        ? req.auth.orgId
        : null;
      const orgId = authContextOrgId ?? orgIdFromBearer(req, { secret, issuer, audience });
      if (!orgId) throw new InvalidTokenError('Token missing orgId');
      assertNoClientOrgConflict(req, orgId);

      const org = await db.organization.findUnique({
        where: { id: orgId },
        select: { subscriptionTier: true, subscriptionStatus: true },
      });
      if (!org) throw new InvalidTokenError('Org not found');

      if (org.subscriptionStatus !== 'ACTIVE') {
        throw new SubscriptionNotActiveError({
          orgId,
          tier: org.subscriptionTier,
          subscriptionStatus: org.subscriptionStatus,
          message: `Subscription status is ${org.subscriptionStatus}`,
        });
      }

      if (!isFeatureEnabled({ tier: org.subscriptionTier, status: org.subscriptionStatus, featureKey })) {
        throw new FeatureNotEnabledError({
          orgId,
          featureKey,
          tier: org.subscriptionTier,
          subscriptionStatus: org.subscriptionStatus,
        });
      }

      // Attach org context for downstream handlers.
      req.org = { orgId };
      req.subscription = {
        featureKey,
        tier: org.subscriptionTier,
        status: org.subscriptionStatus,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

function orgIdFromBearer(
  req: any,
  params: { secret: string; issuer?: string; audience?: string },
): string {
  const auth = String(req?.headers?.authorization ?? req?.headers?.Authorization ?? '');
  if (!auth) throw new AuthRequiredError('Missing Authorization header');
  const token = extractBearer(auth);
  if (!token) throw new AuthRequiredError('Missing bearer token');

  let payload: JwtOrgPayload;
  try {
    payload = jwt.verify(token, params.secret, {
      algorithms: ['HS256'],
      ...(params.issuer ? { issuer: params.issuer } : {}),
      ...(params.audience ? { audience: params.audience } : {}),
    }) as JwtOrgPayload;
  } catch (err) {
    throw new InvalidTokenError('Invalid token');
  }

  if (!payload.orgId) throw new InvalidTokenError('Token missing orgId');
  return payload.orgId;
}

function assertNoClientOrgConflict(req: any, orgId: string): void {
  for (const candidate of [
    req?.params?.orgId,
    req?.query?.orgId,
    req?.body?.orgId,
  ]) {
    if (typeof candidate === 'string' && candidate.length > 0 && candidate !== orgId) {
      throw new InvalidTokenError('Client orgId conflicts with authenticated orgId');
    }
  }
}

function extractBearer(auth: string): string | null {
  const s = auth.trim();
  if (s.toLowerCase().startsWith('bearer ')) return s.slice(7).trim();
  return s.length > 0 ? s : null;
}
