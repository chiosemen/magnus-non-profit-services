import jwt from 'jsonwebtoken';
import { prisma } from '@magnus/db/client';
import type { PrismaClient } from '@magnus/db/types';
import type { FeatureKey } from '../features';
import { FeatureNotEnabledError, AuthRequiredError, InvalidTokenError, SubscriptionNotActiveError } from '../errors';
import { isFeatureEnabled } from '../policy';
import { hasInstitutionalProgramFeature } from '../programFeatureAccess';

export type RequireFeatureOptions = {
  db?: PrismaClient;
  jwtSecret?: string;
  jwtIssuer?: string;
  jwtAudience?: string;
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

  return async (req: any, _res: any, next: (err?: unknown) => void) => {
    try {
      const auth = String(req?.headers?.authorization ?? req?.headers?.Authorization ?? '');
      if (!auth) throw new AuthRequiredError('Missing Authorization header');
      const token = extractBearer(auth);
      if (!token) throw new AuthRequiredError('Missing bearer token');

      let payload: JwtOrgPayload;
      try {
        payload = jwt.verify(token, secret, {
          algorithms: ['HS256'],
          ...(issuer ? { issuer } : {}),
          ...(audience ? { audience } : {}),
        }) as JwtOrgPayload;
      } catch (err) {
        throw new InvalidTokenError('Invalid token');
      }

      const orgId = payload.orgId;
      if (!orgId) throw new InvalidTokenError('Token missing orgId');

      const org = await db.organization.findUnique({
        where: { id: orgId },
        select: { subscriptionTier: true, subscriptionStatus: true },
      });
      if (!org) throw new InvalidTokenError('Org not found');

      if (org.subscriptionStatus !== 'ACTIVE') {
        throw new SubscriptionNotActiveError({ orgId, message: `Subscription status is ${org.subscriptionStatus}` });
      }

      if (isFeatureEnabled({ tier: org.subscriptionTier, status: org.subscriptionStatus, featureKey })) {
        req.org = { orgId };
        next();
        return;
      }

      if (await hasInstitutionalProgramFeature(db, orgId, featureKey)) {
        req.org = { orgId };
        next();
        return;
      }

      throw new FeatureNotEnabledError({ orgId, featureKey });
    } catch (err) {
      next(err);
    }
  };
}

function extractBearer(auth: string): string | null {
  const s = auth.trim();
  if (s.toLowerCase().startsWith('bearer ')) return s.slice(7).trim();
  return s.length > 0 ? s : null;
}

