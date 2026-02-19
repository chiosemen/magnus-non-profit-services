import jwt from 'jsonwebtoken';

export type AuthContext = {
  orgId: string;
  workerId?: string;
  role: string;
  sub?: string;
};

export type JwtAuthOptions = {
  jwtSecret?: string;
  jwtIssuer?: string;
  jwtAudience?: string;
  requireWorkerId?: boolean;
};

type JwtAppPayload = {
  orgId?: unknown;
  workerId?: unknown;
  role?: unknown;
  roles?: unknown;
  sub?: unknown;
};

// Framework-agnostic Express-compatible middleware.
export function createJwtAuthMiddleware(options: JwtAuthOptions = {}) {
  const secret = options.jwtSecret ?? process.env['JWT_SECRET'];
  if (!secret || secret.length < 32) {
    // Fail closed at startup: apps should crash if secret isn't configured.
    throw new Error('JWT_SECRET must be set and at least 32 characters');
  }

  const issuer = options.jwtIssuer ?? process.env['JWT_ISSUER'];
  const audience = options.jwtAudience ?? process.env['JWT_AUDIENCE'];

  return (req: any, res: any, next: (err?: unknown) => void) => {
    const authHeader = String(req?.headers?.authorization ?? req?.headers?.Authorization ?? '');
    if (!authHeader) {
      res.status(401).json({ error: 'AUTH_REQUIRED' });
      return;
    }

    const token = extractBearer(authHeader);
    if (!token) {
      res.status(401).json({ error: 'AUTH_REQUIRED' });
      return;
    }

    let decoded: unknown;
    try {
      decoded = jwt.verify(token, secret, {
        algorithms: ['HS256'],
        ...(issuer ? { issuer } : {}),
        ...(audience ? { audience } : {}),
      });
    } catch {
      res.status(401).json({ error: 'AUTH_INVALID' });
      return;
    }

    if (!decoded || typeof decoded !== 'object') {
      res.status(401).json({ error: 'AUTH_INVALID' });
      return;
    }

    const payload = decoded as JwtAppPayload;
    const orgId = typeof payload.orgId === 'string' ? payload.orgId : null;
    const workerId = typeof payload.workerId === 'string' ? payload.workerId : null;
    const role = parseRole(payload);
    const sub = typeof payload.sub === 'string' ? payload.sub : null;

    if (!orgId || !role) {
      res.status(401).json({ error: 'AUTH_INVALID' });
      return;
    }
    if (options.requireWorkerId && !workerId) {
      res.status(401).json({ error: 'WORKER_AUTH_REQUIRED' });
      return;
    }

    const auth: AuthContext = {
      orgId,
      ...(workerId ? { workerId } : {}),
      role,
      ...(sub ? { sub } : {}),
    };
    req.auth = auth;
    next();
  };
}

function extractBearer(authHeader: string): string | null {
  const s = authHeader.trim();
  if (!s) return null;
  if (s.toLowerCase().startsWith('bearer ')) return s.slice(7).trim();
  return s;
}

function parseRole(payload: JwtAppPayload): string | null {
  if (typeof payload.role === 'string' && payload.role.trim().length > 0) return payload.role;
  if (Array.isArray(payload.roles) && typeof payload.roles[0] === 'string' && payload.roles[0].trim().length > 0) {
    return payload.roles[0];
  }
  return null;
}

