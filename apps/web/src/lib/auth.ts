import jwt from 'jsonwebtoken';

export const AUTH_COOKIE_NAME = 'magnus_token';
export const REFRESH_COOKIE_NAME = 'magnus_refresh';

export type AppJwtPayload = {
  orgId: string;
  workerId: string;
  role: string;
  sessionId: string;
  sub: string;
};

export function signAppToken(payload: AppJwtPayload): string {
  const secret = getJwtSecret();
  const jwtOptions = getJwtClaimOptions();
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn: '15m',
    ...jwtOptions,
  });
}

export function verifyAppToken(token: string): AppJwtPayload {
  const secret = getJwtSecret();
  const decoded = jwt.verify(token, secret, {
    algorithms: ['HS256'],
    ...getJwtClaimOptions(),
  });
  if (!decoded || typeof decoded !== 'object') throw new Error('AUTH_INVALID');

  const p = decoded as Partial<AppJwtPayload>;
  if (
    typeof p.orgId !== 'string' ||
    typeof p.workerId !== 'string' ||
    typeof p.role !== 'string' ||
    typeof p.sessionId !== 'string' ||
    typeof p.sub !== 'string'
  ) {
    throw new Error('AUTH_INVALID');
  }
  return {
    orgId: p.orgId,
    workerId: p.workerId,
    role: p.role,
    sessionId: p.sessionId,
    sub: p.sub,
  };
}

function getJwtSecret(): string {
  const secret = process.env['JWT_SECRET'];
  if (!secret || secret.length < 32) {
    // Fail closed (runtime): auth endpoints must not operate without a real secret.
    throw new Error('JWT_SECRET must be set and at least 32 characters');
  }
  return secret;
}

function getJwtClaimOptions(): { issuer?: string; audience?: string } {
  const issuer = process.env['JWT_ISSUER']?.trim();
  const audience = process.env['JWT_AUDIENCE']?.trim();

  return {
    ...(issuer ? { issuer } : {}),
    ...(audience ? { audience } : {}),
  };
}
