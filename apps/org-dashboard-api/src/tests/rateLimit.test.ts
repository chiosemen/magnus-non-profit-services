import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOrgDashboardRateLimiter,
  isRateLimitExceeded,
  ORG_DASHBOARD_RATE_LIMIT_DURATION_SECONDS,
  ORG_DASHBOARD_RATE_LIMIT_KEY_PREFIX,
  ORG_DASHBOARD_RATE_LIMIT_POINTS,
} from '../rateLimit';

const silentLogger = { info() {}, warn() {} };

class FakeMemoryLimiter {
  options: Record<string, unknown>;
  constructor(options: Record<string, unknown>) {
    this.options = options;
  }
  async consume() {}
}

class FakeRedisLimiter {
  options: Record<string, unknown>;
  constructor(options: Record<string, unknown>) {
    this.options = options;
  }
  async consume() {}
}

test('org-dashboard rate limiter fails closed in production when REDIS_URL is missing', async () => {
  await assert.rejects(
    () => buildOrgDashboardRateLimiter({
      env: { NODE_ENV: 'production', REDIS_URL: '' } as NodeJS.ProcessEnv,
      RateLimiterMemoryClass: FakeMemoryLimiter,
      logger: silentLogger,
    }),
    /REDIS_URL is required/,
  );
});

test('org-dashboard rate limiter fails closed in production when Redis boot check fails', async () => {
  class FailingRedis {
    async connect() {
      throw new Error('connect failed');
    }
  }

  await assert.rejects(
    () => buildOrgDashboardRateLimiter({
      env: { NODE_ENV: 'production', REDIS_URL: 'redis://127.0.0.1:1' } as NodeJS.ProcessEnv,
      RedisClass: FailingRedis,
      RateLimiterRedisClass: FakeRedisLimiter,
      RateLimiterMemoryClass: FakeMemoryLimiter,
      logger: silentLogger,
    }),
    /Redis rate limit backend failed to connect/,
  );
});

test('org-dashboard rate limiter allows dev/test memory fallback with warning', async () => {
  const warnings: string[] = [];
  const limiter = await buildOrgDashboardRateLimiter({
    env: { NODE_ENV: 'development', REDIS_URL: '' } as NodeJS.ProcessEnv,
    RateLimiterMemoryClass: FakeMemoryLimiter,
    logger: { info() {}, warn(message: string) { warnings.push(message); } },
  });

  assert.ok(limiter instanceof FakeMemoryLimiter);
  assert.equal(limiter.options.points, ORG_DASHBOARD_RATE_LIMIT_POINTS);
  assert.equal(limiter.options.duration, ORG_DASHBOARD_RATE_LIMIT_DURATION_SECONDS);
  assert.equal(limiter.options.keyPrefix, ORG_DASHBOARD_RATE_LIMIT_KEY_PREFIX);
  assert.match(warnings.join('\n'), /local dev\/test only/);
});

test('org-dashboard rate limiter uses Redis path when configured', async () => {
  const redisInstances: Array<{ url: string; options: Record<string, unknown>; connected?: boolean }> = [];
  class FakeRedis {
    url: string;
    options: Record<string, unknown>;
    connected?: boolean;
    constructor(url: string, options: Record<string, unknown>) {
      this.url = url;
      this.options = options;
      redisInstances.push(this);
    }
    async connect() {
      this.connected = true;
    }
  }

  const limiter = await buildOrgDashboardRateLimiter({
    env: { NODE_ENV: 'production', REDIS_URL: 'redis://redis.internal:6379' } as NodeJS.ProcessEnv,
    RedisClass: FakeRedis,
    RateLimiterRedisClass: FakeRedisLimiter,
    RateLimiterMemoryClass: FakeMemoryLimiter,
    logger: silentLogger,
  });

  assert.ok(limiter instanceof FakeRedisLimiter);
  assert.equal(redisInstances[0].url, 'redis://redis.internal:6379');
  assert.equal(redisInstances[0].options.enableOfflineQueue, false);
  assert.equal(redisInstances[0].connected, true);
  assert.equal(limiter.options.points, ORG_DASHBOARD_RATE_LIMIT_POINTS);
  assert.equal(limiter.options.duration, ORG_DASHBOARD_RATE_LIMIT_DURATION_SECONDS);
  assert.equal(limiter.options.keyPrefix, ORG_DASHBOARD_RATE_LIMIT_KEY_PREFIX);
});

test('org-dashboard rate limiter distinguishes exhausted limits from backend failures', () => {
  assert.equal(isRateLimitExceeded({ msBeforeNext: 1000 }), true);
  assert.equal(isRateLimitExceeded(new Error('redis unavailable')), false);
});
