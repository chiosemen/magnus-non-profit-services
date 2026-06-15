import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';
import Redis from 'ioredis';

export const ORG_DASHBOARD_RATE_LIMIT_POINTS = 300;
export const ORG_DASHBOARD_RATE_LIMIT_DURATION_SECONDS = 60;
export const ORG_DASHBOARD_RATE_LIMIT_KEY_PREFIX = 'org_dashboard_rl';

type RateLimiterLike = {
  consume(key: string, pointsToConsume?: number): Promise<unknown>;
};

type RedisClientLike = {
  connect?: () => Promise<unknown>;
  ping?: () => Promise<unknown>;
};

type LoggerLike = Pick<Console, 'info' | 'warn'>;

type BuildOptions = {
  env?: NodeJS.ProcessEnv;
  RedisClass?: new (url: string, options: Record<string, unknown>) => RedisClientLike;
  RateLimiterRedisClass?: new (options: Record<string, unknown>) => RateLimiterLike;
  RateLimiterMemoryClass?: new (options: Record<string, unknown>) => RateLimiterLike;
  logger?: LoggerLike;
};

export class RateLimitBackendUnavailableError extends Error {
  readonly code = 'RATE_LIMIT_BACKEND_UNAVAILABLE';

  constructor(message = 'Rate limit backend is unavailable') {
    super(message);
    this.name = 'RateLimitBackendUnavailableError';
  }
}

export function isRateLimitExceeded(err: unknown): boolean {
  return err !== null && typeof err === 'object' && 'msBeforeNext' in err;
}

export async function buildOrgDashboardRateLimiter(options: BuildOptions = {}): Promise<RateLimiterLike> {
  const env = options.env ?? process.env;
  const logger = options.logger ?? console;
  const redisUrl = env['REDIS_URL']?.trim();
  const isProduction = env['NODE_ENV'] === 'production';
  const RedisClass = options.RedisClass ?? Redis;
  const RateLimiterRedisClass = options.RateLimiterRedisClass ?? RateLimiterRedis;
  const RateLimiterMemoryClass = options.RateLimiterMemoryClass ?? RateLimiterMemory;

  if (!redisUrl) {
    if (isProduction) {
      throw new RateLimitBackendUnavailableError('REDIS_URL is required for production org-dashboard-api rate limiting');
    }
    logger.warn('[magnus:org-dashboard-rate-limit] REDIS_URL is not set. Using in-memory limiter for local dev/test only.');
    return new RateLimiterMemoryClass({
      keyPrefix: ORG_DASHBOARD_RATE_LIMIT_KEY_PREFIX,
      points: ORG_DASHBOARD_RATE_LIMIT_POINTS,
      duration: ORG_DASHBOARD_RATE_LIMIT_DURATION_SECONDS,
    });
  }

  try {
    const redisClient = new RedisClass(redisUrl, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 2,
      connectTimeout: 2000,
      lazyConnect: true,
    });
    if (typeof redisClient.connect === 'function') await redisClient.connect();
    else if (typeof redisClient.ping === 'function') await redisClient.ping();

    const limiter = new RateLimiterRedisClass({
      storeClient: redisClient,
      keyPrefix: ORG_DASHBOARD_RATE_LIMIT_KEY_PREFIX,
      points: ORG_DASHBOARD_RATE_LIMIT_POINTS,
      duration: ORG_DASHBOARD_RATE_LIMIT_DURATION_SECONDS,
    });
    logger.info('[magnus:org-dashboard-rate-limit] Redis-backed rate limiter active (multi-instance safe).');
    return limiter;
  } catch {
    if (isProduction) {
      throw new RateLimitBackendUnavailableError('Redis rate limit backend failed to connect');
    }
    logger.warn('[magnus:org-dashboard-rate-limit] Redis connection failed. Falling back to in-memory limiter for local dev/test only.');
    return new RateLimiterMemoryClass({
      keyPrefix: ORG_DASHBOARD_RATE_LIMIT_KEY_PREFIX,
      points: ORG_DASHBOARD_RATE_LIMIT_POINTS,
      duration: ORG_DASHBOARD_RATE_LIMIT_DURATION_SECONDS,
    });
  }
}

let rateLimiter: RateLimiterLike | null = null;

export async function initializeOrgDashboardRateLimiter(): Promise<void> {
  rateLimiter = await buildOrgDashboardRateLimiter();
}

export async function getOrgDashboardRateLimiter(): Promise<RateLimiterLike> {
  if (!rateLimiter) rateLimiter = await buildOrgDashboardRateLimiter();
  return rateLimiter;
}

export function createOrgDashboardRateLimitMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as RequestWithAuth).auth;
    const identifier = auth?.orgId ?? req.ip ?? 'anonymous';
    getOrgDashboardRateLimiter()
      .then(limiter => limiter.consume(identifier))
      .then(() => {
        next();
      })
      .catch((err: unknown) => {
        if (isRateLimitExceeded(err)) {
          res.status(429).json({ error: 'TOO_MANY_REQUESTS' });
          return;
        }
        res.status(503).json({ error: 'RATE_LIMIT_BACKEND_UNAVAILABLE' });
      });
  };
}

export function _resetOrgDashboardRateLimiterForTest(): void {
  rateLimiter = null;
}

type RequestWithAuth = Request & {
  auth?: {
    orgId?: string;
  };
};
