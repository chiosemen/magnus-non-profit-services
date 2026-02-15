import jwt from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';
import type { AuthPayload } from './types';

const ACCESS_TOKEN_EXPIRES_IN = '15m';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters');
  }
  return secret;
}

function assertAuthPayload(payload: AuthPayload): void {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid auth payload');
  if (typeof payload.userId !== 'string' || payload.userId.trim().length === 0) throw new Error('Invalid auth payload');
  if (typeof payload.orgId !== 'string' || payload.orgId.trim().length === 0) throw new Error('Invalid auth payload');
  if (typeof payload.role !== 'string' || payload.role.trim().length === 0) throw new Error('Invalid auth payload');
}

export function signAccessToken(payload: AuthPayload): string {
  assertAuthPayload(payload);
  const secret = getJwtSecret();

  return jwt.sign(
    { orgId: payload.orgId, role: payload.role },
    secret,
    {
      algorithm: 'HS256',
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      subject: payload.userId,
    },
  );
}

export function verifyAccessToken(token: string): AuthPayload {
  if (typeof token !== 'string' || token.trim().length === 0) throw new Error('Invalid token');
  const secret = getJwtSecret();

  const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
  if (!decoded || typeof decoded !== 'object') throw new Error('Invalid token');

  const p = decoded as JwtPayload & Partial<{ orgId: unknown; role: unknown }>;
  const userId = typeof p.sub === 'string' ? p.sub : '';
  const orgId = typeof p.orgId === 'string' ? p.orgId : '';
  const role = typeof p.role === 'string' ? p.role : '';

  if (!userId || !orgId || !role) throw new Error('Invalid token');
  return { userId, orgId, role };
}

