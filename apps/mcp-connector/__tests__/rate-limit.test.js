const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildMcpRateLimiter,
  isRateLimitExceeded,
  MCP_RATE_LIMIT_POINTS,
  MCP_RATE_LIMIT_DURATION_SECONDS,
  MCP_RATE_LIMIT_KEY_PREFIX,
} = require('../dist/rateLimit');

const silentLogger = { info() {}, warn() {} };

class FakeMemoryLimiter {
  constructor(options) {
    this.options = options;
  }
  async consume() {}
}

class FakeRedisLimiter {
  constructor(options) {
    this.options = options;
  }
  async consume() {}
}

test('MCP rate limiter fails closed in production when REDIS_URL is missing', async () => {
  await assert.rejects(
    () => buildMcpRateLimiter({
      env: { NODE_ENV: 'production', REDIS_URL: '' },
      RateLimiterMemoryClass: FakeMemoryLimiter,
      logger: silentLogger,
    }),
    /REDIS_URL is required/,
  );
});

test('MCP rate limiter fails closed in production when Redis boot check fails', async () => {
  class FailingRedis {
    async connect() {
      throw new Error('connect failed');
    }
  }

  await assert.rejects(
    () => buildMcpRateLimiter({
      env: { NODE_ENV: 'production', REDIS_URL: 'redis://127.0.0.1:1' },
      RedisClass: FailingRedis,
      RateLimiterRedisClass: FakeRedisLimiter,
      RateLimiterMemoryClass: FakeMemoryLimiter,
      logger: silentLogger,
    }),
    /Redis rate limit backend failed to connect/,
  );
});

test('MCP rate limiter allows dev/test memory fallback with warning', async () => {
  const warnings = [];
  const limiter = await buildMcpRateLimiter({
    env: { NODE_ENV: 'development', REDIS_URL: '' },
    RateLimiterMemoryClass: FakeMemoryLimiter,
    logger: { info() {}, warn(message) { warnings.push(message); } },
  });

  assert.ok(limiter instanceof FakeMemoryLimiter);
  assert.equal(limiter.options.points, MCP_RATE_LIMIT_POINTS);
  assert.equal(limiter.options.duration, MCP_RATE_LIMIT_DURATION_SECONDS);
  assert.equal(limiter.options.keyPrefix, MCP_RATE_LIMIT_KEY_PREFIX);
  assert.match(warnings.join('\n'), /local dev\/test only/);
});

test('MCP rate limiter uses Redis path when configured', async () => {
  const redisInstances = [];
  class FakeRedis {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      redisInstances.push(this);
    }
    async connect() {
      this.connected = true;
    }
  }

  const limiter = await buildMcpRateLimiter({
    env: { NODE_ENV: 'production', REDIS_URL: 'redis://redis.internal:6379' },
    RedisClass: FakeRedis,
    RateLimiterRedisClass: FakeRedisLimiter,
    RateLimiterMemoryClass: FakeMemoryLimiter,
    logger: silentLogger,
  });

  assert.ok(limiter instanceof FakeRedisLimiter);
  assert.equal(redisInstances[0].url, 'redis://redis.internal:6379');
  assert.equal(redisInstances[0].options.enableOfflineQueue, false);
  assert.equal(redisInstances[0].connected, true);
  assert.equal(limiter.options.points, MCP_RATE_LIMIT_POINTS);
  assert.equal(limiter.options.duration, MCP_RATE_LIMIT_DURATION_SECONDS);
  assert.equal(limiter.options.keyPrefix, MCP_RATE_LIMIT_KEY_PREFIX);
});

test('MCP rate limiter distinguishes exhausted limits from backend failures', () => {
  assert.equal(isRateLimitExceeded({ msBeforeNext: 1000 }), true);
  assert.equal(isRateLimitExceeded(new Error('redis unavailable')), false);
});
