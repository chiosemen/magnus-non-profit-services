/**
 * Wave 2 Security Tests — Full Spec
 *
 * 1. CSRF module: validateCsrfOrigin behavior in dev and production-like scenarios
 * 2. next.config.js: verifies key security header directives are present
 * 3. Rate limiter: interface contract and dual-mode (Redis/memory) behavior
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// ─── 1. CSRF Module Tests ─────────────────────────────────────────────────────

const CSRF_HEADER = 'x-magnus-csrf';

function makeRequest(options = {}) {
  const { headers = {}, url = 'http://localhost:3000/api/auth/login' } = options;
  return {
    headers: {
      get: (name) => headers[name.toLowerCase()] ?? null,
    },
    url,
  };
}

// Reproduce the CSRF logic (mirrors src/lib/csrf.ts) for isolated unit testing
function validateCsrfOrigin(request, nodeEnv = 'development', appUrl = null) {
  const csrfHeader = request.headers.get(CSRF_HEADER);
  if (!csrfHeader || csrfHeader.trim() !== '1') return false;

  if (nodeEnv === 'production') {
    if (!appUrl) return false;
    let appOrigin;
    try { appOrigin = new URL(appUrl).origin; } catch { return false; }

    const origin = request.headers.get('origin');
    if (origin) return origin === appOrigin;

    const referer = request.headers.get('referer');
    if (referer) {
      try { return new URL(referer).origin === appOrigin; } catch { return false; }
    }
    return false;
  }

  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.endsWith('.localhost');
  } catch { return false; }
}

// ── Dev mode tests ────────────────────────────────────────────────────────────

test('CSRF: request without custom header is rejected', () => {
  const req = makeRequest({ headers: { 'origin': 'http://localhost:3000' } });
  assert.equal(validateCsrfOrigin(req, 'development'), false);
});

test('CSRF: request with wrong header value is rejected', () => {
  const req = makeRequest({ headers: { 'x-magnus-csrf': '0', 'origin': 'http://localhost:3000' } });
  assert.equal(validateCsrfOrigin(req, 'development'), false);
});

test('CSRF: request with header + localhost origin is allowed in dev', () => {
  const req = makeRequest({ headers: { 'x-magnus-csrf': '1', 'origin': 'http://localhost:3000' } });
  assert.equal(validateCsrfOrigin(req, 'development'), true);
});

test('CSRF: request with header + 127.0.0.1 origin is allowed in dev', () => {
  const req = makeRequest({ headers: { 'x-magnus-csrf': '1', 'origin': 'http://127.0.0.1:3000' } });
  assert.equal(validateCsrfOrigin(req, 'development'), true);
});

test('CSRF: request with header + no origin (curl/Postman) is allowed in dev', () => {
  const req = makeRequest({ headers: { 'x-magnus-csrf': '1' } });
  assert.equal(validateCsrfOrigin(req, 'development'), true);
});

test('CSRF: request with header + external origin is rejected in dev', () => {
  const req = makeRequest({ headers: { 'x-magnus-csrf': '1', 'origin': 'http://evil.com' } });
  assert.equal(validateCsrfOrigin(req, 'development'), false);
});

// ── Production mode tests ─────────────────────────────────────────────────────

const PROD_APP_URL = 'https://app.magnus.com';

test('CSRF: no header → rejected in production', () => {
  const req = makeRequest({ headers: { 'origin': PROD_APP_URL } });
  assert.equal(validateCsrfOrigin(req, 'production', PROD_APP_URL), false);
});

test('CSRF: header + correct Origin → allowed in production', () => {
  const req = makeRequest({ headers: { 'x-magnus-csrf': '1', 'origin': 'https://app.magnus.com' } });
  assert.equal(validateCsrfOrigin(req, 'production', PROD_APP_URL), true);
});

test('CSRF: header + wrong Origin → rejected in production', () => {
  const req = makeRequest({ headers: { 'x-magnus-csrf': '1', 'origin': 'https://evil.com' } });
  assert.equal(validateCsrfOrigin(req, 'production', PROD_APP_URL), false);
});

test('CSRF: header + correct Referer (no Origin) → allowed in production', () => {
  const req = makeRequest({ headers: { 'x-magnus-csrf': '1', 'referer': 'https://app.magnus.com/login' } });
  assert.equal(validateCsrfOrigin(req, 'production', PROD_APP_URL), true);
});

test('CSRF: header + wrong Referer → rejected in production', () => {
  const req = makeRequest({ headers: { 'x-magnus-csrf': '1', 'referer': 'https://evil.com/page' } });
  assert.equal(validateCsrfOrigin(req, 'production', PROD_APP_URL), false);
});

test('CSRF: header + no Origin + no Referer → rejected in production (ambiguous)', () => {
  const req = makeRequest({ headers: { 'x-magnus-csrf': '1' } });
  assert.equal(validateCsrfOrigin(req, 'production', PROD_APP_URL), false);
});

test('CSRF: NEXT_PUBLIC_APP_URL not set in production → fail closed', () => {
  const req = makeRequest({ headers: { 'x-magnus-csrf': '1', 'origin': 'https://app.magnus.com' } });
  assert.equal(validateCsrfOrigin(req, 'production', null), false);
});

// ─── 2. next.config.js Security Header Tests ──────────────────────────────────

test('next.config.js exports a headers() function', () => {
  const config = loadNextConfigForTest();
  assert.equal(typeof config.headers, 'function', 'next.config.js must export headers()');
});

test('headers: Content-Security-Policy is present with no unsafe-eval and frame-ancestors none', async () => {
  const config = loadNextConfigForTest();
  const headersList = await config.headers();
  const allHeaders = headersList.flatMap(h => h.headers);
  const csp = allHeaders.find(h => h.key === 'Content-Security-Policy');
  assert.ok(csp, 'Content-Security-Policy must be present');
  assert.match(csp.value, /default-src 'self'/, 'CSP must include default-src self');
  assert.match(csp.value, /frame-ancestors 'none'/, 'CSP must include frame-ancestors none');
  assert.ok(!csp.value.includes("'unsafe-eval'"), "CSP must NOT include 'unsafe-eval'");
});

test('headers: Strict-Transport-Security with includeSubDomains', async () => {
  const config = loadNextConfigForTest();
  const headersList = await config.headers();
  const allHeaders = headersList.flatMap(h => h.headers);
  const hsts = allHeaders.find(h => h.key === 'Strict-Transport-Security');
  assert.ok(hsts, 'Strict-Transport-Security must be present');
  assert.match(hsts.value, /max-age=\d+/, 'HSTS must include max-age');
  assert.match(hsts.value, /includeSubDomains/, 'HSTS must include includeSubDomains');
});

test('headers: X-Frame-Options is DENY', async () => {
  const config = loadNextConfigForTest();
  const headersList = await config.headers();
  const allHeaders = headersList.flatMap(h => h.headers);
  const xfo = allHeaders.find(h => h.key === 'X-Frame-Options');
  assert.ok(xfo, 'X-Frame-Options must be present');
  assert.equal(xfo.value, 'DENY');
});

test('headers: X-Content-Type-Options is nosniff', async () => {
  const config = loadNextConfigForTest();
  const headersList = await config.headers();
  const allHeaders = headersList.flatMap(h => h.headers);
  const xcto = allHeaders.find(h => h.key === 'X-Content-Type-Options');
  assert.ok(xcto, 'X-Content-Type-Options must be present');
  assert.equal(xcto.value, 'nosniff');
});

test('headers: Referrer-Policy is strict-origin-when-cross-origin', async () => {
  const config = loadNextConfigForTest();
  const headersList = await config.headers();
  const allHeaders = headersList.flatMap(h => h.headers);
  const rp = allHeaders.find(h => h.key === 'Referrer-Policy');
  assert.ok(rp, 'Referrer-Policy must be present');
  assert.equal(rp.value, 'strict-origin-when-cross-origin');
});

test('headers: Permissions-Policy disables camera, geolocation, and payment', async () => {
  const config = loadNextConfigForTest();
  const headersList = await config.headers();
  const allHeaders = headersList.flatMap(h => h.headers);
  const pp = allHeaders.find(h => h.key === 'Permissions-Policy');
  assert.ok(pp, 'Permissions-Policy must be present');
  assert.match(pp.value, /camera=\(\)/, 'Must disable camera');
  assert.match(pp.value, /geolocation=\(\)/, 'Must disable geolocation');
  assert.match(pp.value, /payment=\(\)/, 'Must disable payment API');
});

// ─── 3. Rate Limiter Interface Tests ─────────────────────────────────────────

test('rate-limit: module exports checkRateLimit, recordFailure, clearFailures as async functions', () => {
  // Verify shape of the module export — functions must be async (return Promise)
  // We import from the TS source via the compiled dist if running from __tests__
  // For this test file, we verify by checking that the rate-limit module exists
  // and exports the correct interface names.
  // Full integration tests require rate-limiter-flexible to be installed.
  const fs = require('fs');
  const path = require('path');
  const rateLimitSrc = fs.readFileSync(
    path.join(__dirname, '../src/lib/rate-limit.ts'),
    'utf8'
  );

  // Verify exported function signatures are async
  assert.match(rateLimitSrc, /export async function checkRateLimit/,
    'checkRateLimit must be an async export');
  assert.match(rateLimitSrc, /export async function recordFailure/,
    'recordFailure must be an async export');
  assert.match(rateLimitSrc, /export async function clearFailures/,
    'clearFailures must be an async export');
});

test('rate-limit: module uses RateLimiterRedis when REDIS_URL is available', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '../src/lib/rate-limit.ts'),
    'utf8'
  );
  assert.match(src, /RateLimiterRedis/, 'Must use RateLimiterRedis for Redis path');
  assert.match(src, /REDIS_URL/, 'Must check REDIS_URL env var');
});

test('rate-limit: module uses RateLimiterMemory only as non-production fallback', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '../src/lib/rate-limit.ts'),
    'utf8'
  );
  assert.match(src, /RateLimiterMemory/, 'Must use RateLimiterMemory as in-memory fallback');
  assert.match(src, /NODE_ENV.*production|isProduction/, 'Must branch on production mode');
});

test('rate-limit: production without REDIS_URL throws instead of warning fallback', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '../src/lib/rate-limit.ts'),
    'utf8'
  );
  assert.match(src, /REDIS_URL is required for production rate limiting/, 'Must fail closed when Redis is missing in production');
  assert.doesNotMatch(src, /Using in-memory rate limiter\.[\s\S]+production deployments/i,
    'Production must not silently use in-memory rate limiting');
});

test('rate-limit: exports test injection helpers for isolation', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '../src/lib/rate-limit.ts'),
    'utf8'
  );
  assert.match(src, /_resetLimiterForTest/, 'Must export _resetLimiterForTest');
  assert.match(src, /_injectLimiterForTest/, 'Must export _injectLimiterForTest');
});

test('rate-limit: production missing REDIS_URL fails closed at limiter initialization', async () => {
  await withEnv({ NODE_ENV: 'production', REDIS_URL: '' }, async () => {
    const mod = loadRateLimitModule();
    mod._resetLimiterForTest();
    await assert.rejects(() => mod.checkRateLimit('prod-missing-redis'), /REDIS_URL is required/);
  });
});

test('rate-limit: production Redis connection failure fails closed', async () => {
  await withEnv({ NODE_ENV: 'production', REDIS_URL: 'redis://127.0.0.1:1' }, async () => {
    const mod = loadRateLimitModule({
      requireOverride(id) {
        if (id === 'ioredis') {
          return class FailingRedis {
            async connect() {
              throw new Error('connect failed');
            }
          };
        }
        if (id === 'rate-limiter-flexible') {
          return {
            RateLimiterRedis: class FakeRedisLimiter {},
            RateLimiterMemory: class FakeMemoryLimiter {},
          };
        }
        return require(id);
      },
    });
    mod._resetLimiterForTest();
    await assert.rejects(() => mod.checkRateLimit('prod-failing-redis'), /Redis rate limit backend failed to connect/);
  });
});

test('rate-limit: development missing REDIS_URL keeps local memory fallback with warning', async () => {
  await withEnv({ NODE_ENV: 'development', REDIS_URL: undefined }, async () => {
    const warnings = [];
    const mod = loadRateLimitModule({
      consoleOverride: {
        ...console,
        warn(message) { warnings.push(String(message)); },
      },
    });
    mod._resetLimiterForTest();
    const result = await mod.checkRateLimit('dev-memory-fallback');
    assert.deepEqual(result, { limited: false });
    assert.match(warnings.join('\n'), /local dev\/test only/);
  });
});

test('rate-limit: test injection helper remains available outside production', async () => {
  await withEnv({ NODE_ENV: 'test', REDIS_URL: undefined }, async () => {
    const mod = loadRateLimitModule();
    mod._resetLimiterForTest();
    mod._injectLimiterForTest({
      get: async () => null,
      consume: async () => ({ remainingPoints: 4 }),
      delete: async () => true,
    });
    assert.deepEqual(await mod.checkRateLimit('test-injected'), { limited: false });
  });
});

test('login route maps rate-limit backend failure to 503', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '../src/app/api/auth/login/route.ts'),
    'utf8'
  );
  assert.match(src, /RATE_LIMIT_BACKEND_UNAVAILABLE/);
  assert.match(src, /status:\s*503/);
});

test('rate-limit: in-memory fallback functional (RateLimiterMemory integration)', async () => {
  // This test exercises the actual RateLimiterMemory in isolation
  // Rate-limiter-flexible is available via the workspace (mcp-connector node_modules)
  // or the web app's node_modules after install.
  const RLF_PATH = [
    require('path').join(__dirname, '../node_modules/rate-limiter-flexible/index.js'),
    require('path').join(__dirname, '../../mcp-connector/node_modules/rate-limiter-flexible/index.js'),
  ].find(p => { try { require('fs').statSync(p); return true; } catch { return false; } });

  if (!RLF_PATH) {
    // rate-limiter-flexible not yet installed — skip gracefully
    console.log('  [SKIP] rate-limiter-flexible not installed yet — run pnpm install');
    return;
  }

  const { RateLimiterMemory } = require(RLF_PATH);
  const limiter = new RateLimiterMemory({ points: 3, duration: 60, keyPrefix: 'test_rl' });

  const testIp = `test-ip-${Date.now()}`;

  // Should not be limited initially
  const initial = await limiter.get(testIp);
  assert.equal(initial, null, 'Fresh IP should have no record');

  // Consume 3 points (hit the limit)
  await limiter.consume(testIp, 1);
  await limiter.consume(testIp, 1);
  await limiter.consume(testIp, 1);

  // Should now be at limit
  const atLimit = await limiter.get(testIp);
  assert.ok(atLimit !== null, 'IP should have a record after 3 failures');
  assert.equal(atLimit.remainingPoints, 0, 'Should have 0 remaining points after 3 failures');

  // 4th consume should throw (limit exceeded)
  await assert.rejects(
    () => limiter.consume(testIp, 1),
    (err) => {
      assert.ok('msBeforeNext' in err, 'Should throw RateLimiterRes with msBeforeNext');
      return true;
    }
  );

  // Clearing should reset
  await limiter.delete(testIp);
  const afterClear = await limiter.get(testIp);
  assert.equal(afterClear, null, 'IP record should be cleared after delete');
});

async function withEnv(overrides, fn) {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    const next = overrides[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function loadRateLimitModule(options = {}) {
  const ts = require('typescript');
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/rate-limit.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  const req = options.requireOverride ?? require;
  const consoleOverride = options.consoleOverride ?? console;
  const factory = new Function('require', 'module', 'exports', 'process', 'console', compiled);
  factory(req, module, module.exports, process, consoleOverride);
  return module.exports;
}

function loadNextConfigForTest() {
  const configPath = path.join(__dirname, '../next.config.js');
  const previousRedisUrl = process.env.REDIS_URL;
  if (process.env.NODE_ENV === 'production' && !process.env.REDIS_URL?.trim()) {
    process.env.REDIS_URL = 'redis://test.redis.local:6379';
  }
  delete require.cache[require.resolve(configPath)];
  try {
    return require(configPath);
  } finally {
    if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousRedisUrl;
  }
}
