import jwt from 'jsonwebtoken';

export const AUTH_COOKIE_NAME = 'magnus_token';

export type AppJwtPayload = {
  orgId: string;
  workerId: string;
  role: string;
  sub?: string;
};

export function signAppToken(payload: AppJwtPayload): string {
  const secret = getJwtSecret();
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn: '7d',
  });
}

export function verifyAppToken(token: string): AppJwtPayload {
  const secret = getJwtSecret();
  const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
  if (!decoded || typeof decoded !== 'object') throw new Error('AUTH_INVALID');

  const p = decoded as Partial<AppJwtPayload>;
  if (typeof p.orgId !== 'string' || typeof p.workerId !== 'string' || typeof p.role !== 'string') {
    throw new Error('AUTH_INVALID');
  }
  return { orgId: p.orgId, workerId: p.workerId, role: p.role, ...(typeof p.sub === 'string' ? { sub: p.sub } : {}) };
}

function getJwtSecret(): string {
  const secret = process.env['JWT_SECRET'];
  if (!secret || secret.length < 32) {
    // Fail closed (runtime): auth endpoints must not operate without a real secret.
    throw new Error('JWT_SECRET must be set and at least 32 characters');
  }
  return secret;
}

