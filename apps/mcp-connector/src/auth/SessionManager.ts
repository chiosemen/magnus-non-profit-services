/**
 * Magnus MCP Connector — SessionManager
 * Creates, validates, refreshes, and invalidates MCP client sessions
 * Redis-backed for distributed deployments
 */

import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { SessionExpiredError } from '../utils/errors';
import { getTokenValidator } from './TokenValidator';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  userId: string;
  orgId: string;
  email: string;
  roles: string[];
  permissions: string[];
  clientId: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  expiresAt: Date;
  lastActivityAt: Date;
  isActive: boolean;
  metadata?: Record<string, unknown>;
}

export interface CreateSessionInput {
  userId: string;
  orgId: string;
  email: string;
  roles: string[];
  permissions: string[];
  clientId: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  keys(pattern: string): Promise<string[]>;
}

// ─── In-Memory Store (dev/test fallback) ──────────────────────────────────────

class InMemoryStore implements SessionStore {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { this.store.delete(key); return null; }
    return entry.value;
  }
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
  async del(key: string): Promise<void> { this.store.delete(key); }
  async keys(pattern: string): Promise<string[]> {
    const prefix = pattern.replace('*', '');
    return Array.from(this.store.keys()).filter(k => k.startsWith(prefix));
  }
}

class RedisStore implements SessionStore {
  private readonly client: Redis;

  constructor(url: string) {
    validateRedisUrl(url);
    this.client = new Redis(url, {
      password: process.env['REDIS_PASSWORD'] || undefined,
      db: parseInt(process.env['REDIS_DB'] ?? '0', 10),
      enableReadyCheck: false,
    });
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async keys(pattern: string): Promise<string[]> {
    const results: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, batch] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      results.push(...batch);
    } while (cursor !== '0');
    return results;
  }
}

function createSessionStore(): SessionStore {
  const redisUrl = process.env['REDIS_URL']?.trim();
  if (redisUrl) {
    try {
      return new RedisStore(redisUrl);
    } catch (err) {
      if (isProduction()) {
        throw new Error(
          `Production MCP sessions require Redis-backed durability; failed to initialize Redis session store from REDIS_URL: ${formatErrorMessage(err)}`,
        );
      }
      warnInMemoryFallback('Failed to initialize Redis session store from REDIS_URL', err);
    }
  }

  if (isProduction()) {
    throw new Error('Production MCP sessions require REDIS_URL; in-memory session fallback is disabled.');
  }

  warnInMemoryFallback('REDIS_URL is not configured; using in-memory session store');
  return new InMemoryStore();
}

// ─── Session Manager ──────────────────────────────────────────────────────────

export class SessionManager {
  private store: SessionStore;
  readonly storeKind: 'redis' | 'memory';
  private readonly ttlSeconds: number;
  private readonly maxSessionsPerUser: number;
  private readonly keyPrefix = 'magnus:session:';
  private readonly userIndexPrefix = 'magnus:user-sessions:';

  constructor(store?: SessionStore) {
    this.store = store ?? createSessionStore();
    this.storeKind = this.store instanceof RedisStore ? 'redis' : 'memory';
    this.ttlSeconds = parseInt(process.env['SESSION_TTL_SECONDS'] ?? '3600', 10);
    this.maxSessionsPerUser = parseInt(process.env['SESSION_MAX_PER_USER'] ?? '5', 10);
  }

  async createSession(input: CreateSessionInput): Promise<Session> {
    await this.enforceSessionLimit(input.userId);
    const now = new Date();
    const session: Session = {
      id: randomUUID(),
      userId: input.userId,
      orgId: input.orgId,
      email: input.email,
      roles: input.roles,
      permissions: input.permissions,
      clientId: input.clientId,
      ...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress } : {}),
      ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}),
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.ttlSeconds * 1000),
      lastActivityAt: now,
      isActive: true,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    };
    await this.store.set(this.key(session.id), JSON.stringify(session), this.ttlSeconds);
    await this.addToUserIndex(input.userId, session.id);
    return session;
  }

  async getSession(sessionId: string): Promise<Session> {
    const raw = await this.store.get(this.key(sessionId));
    if (!raw) throw new SessionExpiredError({ sessionId });
    const session: Session = JSON.parse(raw);
    session.createdAt = new Date(session.createdAt);
    session.expiresAt = new Date(session.expiresAt);
    session.lastActivityAt = new Date(session.lastActivityAt);
    if (!session.isActive) throw new SessionExpiredError({ sessionId });
    return session;
  }

  async touchSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    session.lastActivityAt = new Date();
    await this.store.set(this.key(sessionId), JSON.stringify(session), this.remainingTTL(session));
  }

  async invalidateSession(sessionId: string): Promise<void> {
    const raw = await this.store.get(this.key(sessionId));
    if (!raw) return;
    const session: Session = JSON.parse(raw);
    session.isActive = false;
    await this.store.set(this.key(sessionId), JSON.stringify(session), 60);
    await this.removeFromUserIndex(session.userId, sessionId);
    getTokenValidator().revokeSession(session.userId, session.id);
  }

  async invalidateAllUserSessions(userId: string): Promise<number> {
    const ids = await this.getUserSessionIds(userId);
    await Promise.all(ids.map(id => this.invalidateSession(id)));
    return ids.length;
  }

  async getUserSessions(userId: string): Promise<Session[]> {
    const ids = await this.getUserSessionIds(userId);
    const results = await Promise.all(ids.map(async id => {
      try { return await this.getSession(id); } catch { return null; }
    }));
    return results.filter((s): s is Session => s !== null && s.isActive);
  }

  async validateSession(sessionId: string): Promise<Session> {
    const session = await this.getSession(sessionId);
    if (new Date() > session.expiresAt) {
      await this.invalidateSession(sessionId);
      throw new SessionExpiredError({ sessionId, expiredAt: session.expiresAt });
    }
    await this.touchSession(sessionId);
    return session;
  }

  async extendSession(sessionId: string): Promise<Session> {
    const session = await this.getSession(sessionId);
    session.expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);
    await this.store.set(this.key(sessionId), JSON.stringify(session), this.ttlSeconds);
    return session;
  }

  private key(sessionId: string): string {
    return `${this.keyPrefix}${sessionId}`;
  }

  private userIndexKey(userId: string): string {
    return `${this.userIndexPrefix}${userId}`;
  }

  private remainingTTL(session: Session): number {
    return Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));
  }

  private async getUserSessionIds(userId: string): Promise<string[]> {
    const raw = await this.store.get(this.userIndexKey(userId));
    return raw ? JSON.parse(raw) : [];
  }

  private async addToUserIndex(userId: string, sessionId: string): Promise<void> {
    const ids = await this.getUserSessionIds(userId);
    ids.push(sessionId);
    await this.store.set(this.userIndexKey(userId), JSON.stringify(ids), this.ttlSeconds * 2);
  }

  private async removeFromUserIndex(userId: string, sessionId: string): Promise<void> {
    const ids = await this.getUserSessionIds(userId);
    const updated = ids.filter(id => id !== sessionId);
    await this.store.set(this.userIndexKey(userId), JSON.stringify(updated), this.ttlSeconds * 2);
  }

  private async enforceSessionLimit(userId: string): Promise<void> {
    const sessions = await this.getUserSessions(userId);
    if (sessions.length >= this.maxSessionsPerUser) {
      const oldest = sessions.sort(
        (a, b) => a.lastActivityAt.getTime() - b.lastActivityAt.getTime()
      )[0];
      if (oldest) await this.invalidateSession(oldest.id);
    }
  }
}

let _manager: SessionManager | null = null;
export function getSessionManager(): SessionManager {
  if (!_manager) _manager = new SessionManager();
  return _manager;
}

function validateRedisUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('REDIS_URL must be a valid redis:// or rediss:// URL');
  }

  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use redis:// or rediss://');
  }

  if (!parsed.hostname) {
    throw new Error('REDIS_URL must include a hostname');
  }
}

function warnInMemoryFallback(reason: string, err?: unknown): void {
  // eslint-disable-next-line no-console
  if (err !== undefined) {
    console.warn(`${reason}. Falling back to in-memory MCP session store.`, err);
    return;
  }
  console.warn(`${reason}. Falling back to in-memory MCP session store.`);
}

function isProduction(): boolean {
  return process.env['NODE_ENV'] === 'production';
}

function formatErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default SessionManager;
