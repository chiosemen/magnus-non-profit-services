/**
 * Magnus MCP Connector — TokenValidator
 * Validates JWT access tokens for all incoming MCP tool calls
 * Blocks: server.ts — every request goes through this gate
 */

import jwt from 'jsonwebtoken';
import { TokenExpiredError, TokenInvalidError, AuthError } from '../utils/errors';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TokenPayload {
  sub: string;                    // User/client ID
  orgId: string;                  // Organization ID (EIN hash)
  email: string;                  // User email
  roles: string[];                // ['admin', 'viewer', 'grant_writer', etc.]
  permissions: string[];          // Explicit tool permissions
  sessionId: string;              // Links to SessionManager
  iat: number;                    // Issued at
  exp: number;                    // Expiration
  iss: string;                    // Issuer (magnus-mcp-connector)
  aud: string;                    // Audience (magnus-nonprofit-os)
}

export interface ValidationResult {
  valid: boolean;
  payload?: TokenPayload;
  error?: string;
  expiresAt?: Date;
}

// ─── Token Validator ──────────────────────────────────────────────────────────

export class TokenValidator {
  private readonly secret: string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly clockTolerance: number;

  // In-memory revocation list (Redis-backed in production via SessionManager)
  private revokedTokens: Set<string> = new Set();

  constructor(options?: {
    secret?: string;
    issuer?: string;
    audience?: string;
    clockTolerance?: number;
  }) {
    const secret = options?.secret ?? process.env['JWT_SECRET'];
    if (!secret || secret.length < 32) {
      throw new Error('JWT_SECRET must be set and at least 32 characters');
    }
    this.secret = secret;
    this.issuer = options?.issuer ?? process.env['JWT_ISSUER'] ?? 'magnus-mcp-connector';
    this.audience = options?.audience ?? process.env['JWT_AUDIENCE'] ?? 'magnus-nonprofit-os';
    this.clockTolerance = options?.clockTolerance ?? 30; // 30-second tolerance
  }

  // ─── Public Methods ─────────────────────────────────────────────────────────

  /**
   * Validate a JWT token and return the decoded payload
   * Throws AuthError subclass on any failure
   */
  validate(token: string): TokenPayload {
    if (!token || typeof token !== 'string') {
      throw new AuthError('No token provided');
    }

    const cleaned = this.extractBearerToken(token);

    let decoded: TokenPayload;
    try {
      decoded = jwt.verify(cleaned, this.secret, {
        issuer: this.issuer,
        audience: this.audience,
        clockTolerance: this.clockTolerance,
        algorithms: ['HS256'],
      }) as TokenPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new TokenExpiredError({ expiredAt: (err as jwt.TokenExpiredError).expiredAt });
      }
      if (err instanceof jwt.JsonWebTokenError) {
        throw new TokenInvalidError({ reason: err.message });
      }
      throw new AuthError('Token validation failed');
    }

    // Check revocation list
    if (this.isRevoked(decoded.sub, decoded.sessionId)) {
      throw new TokenInvalidError({ reason: 'Token has been revoked' });
    }

    // Validate required payload fields
    this.assertPayloadFields(decoded);

    return decoded;
  }

  /**
   * Non-throwing version — returns ValidationResult
   * Use for middleware that needs to handle invalid tokens gracefully
   */
  tryValidate(token: string): ValidationResult {
    try {
      const payload = this.validate(token);
      return {
        valid: true,
        payload,
        expiresAt: new Date(payload.exp * 1000),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { valid: false, error: message };
    }
  }

  /**
   * Decode without verification (for debugging/logging only — never trust this)
   */
  decodeUnverified(token: string): Partial<TokenPayload> | null {
    try {
      return jwt.decode(token) as Partial<TokenPayload>;
    } catch {
      return null;
    }
  }

  /**
   * Extract token from Authorization header or raw string
   */
  extractBearerToken(authHeader: string): string {
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    return authHeader.trim();
  }

  /**
   * Check if token is close to expiry (within threshold seconds)
   * Use to proactively refresh tokens in the client
   */
  isNearExpiry(payload: TokenPayload, thresholdSeconds = 300): boolean {
    const now = Math.floor(Date.now() / 1000);
    return payload.exp - now < thresholdSeconds;
  }

  /**
   * Revoke a session — tokens for this session will be rejected
   * Called by SessionManager.invalidateSession()
   */
  revokeSession(userId: string, sessionId: string): void {
    this.revokedTokens.add(`${userId}:${sessionId}`);
  }

  /**
   * Clear revocation entry (on session re-issue)
   */
  clearRevocation(userId: string, sessionId: string): void {
    this.revokedTokens.delete(`${userId}:${sessionId}`);
  }

  /**
   * Return expiry date from token payload
   */
  getExpiryDate(payload: TokenPayload): Date {
    return new Date(payload.exp * 1000);
  }

  /**
   * Check if user has a specific permission
   */
  hasPermission(payload: TokenPayload, permission: string): boolean {
    return (
      payload.permissions.includes(permission) ||
      payload.permissions.includes('*') ||
      payload.roles.includes('admin')
    );
  }

  /**
   * Check if user has a specific role
   */
  hasRole(payload: TokenPayload, role: string): boolean {
    return payload.roles.includes(role) || payload.roles.includes('admin');
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private isRevoked(userId: string, sessionId: string): boolean {
    return this.revokedTokens.has(`${userId}:${sessionId}`);
  }

  private assertPayloadFields(payload: TokenPayload): void {
    const required: (keyof TokenPayload)[] = [
      'sub', 'orgId', 'email', 'roles', 'permissions', 'sessionId',
    ];
    for (const field of required) {
      if (!payload[field]) {
        throw new TokenInvalidError({ reason: `Missing required field: ${field}` });
      }
    }
    if (!Array.isArray(payload.roles)) {
      throw new TokenInvalidError({ reason: 'roles must be an array' });
    }
    if (!Array.isArray(payload.permissions)) {
      throw new TokenInvalidError({ reason: 'permissions must be an array' });
    }
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

let _validator: TokenValidator | null = null;

export function getTokenValidator(): TokenValidator {
  if (!_validator) {
    _validator = new TokenValidator();
  }
  return _validator;
}

export default TokenValidator;
