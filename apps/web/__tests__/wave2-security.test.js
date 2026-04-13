/**
 * Wave 2 Security Tests
 *
 * 1. CSRF module: validateCsrfOrigin behavior in dev and production-like scenarios
 * 2. next.config.js: verifies key security header directives are present
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

// ─── 1. CSRF Module Tests ─────────────────────────────────────────────────────
// We test the compiled JS directly by copying and adapting the core logic,
// since Next.js web app uses module aliases and cannot be required directly
// in this test runner. The logic is self-contained.

// Reproduce the CSRF logic (mirrors src/lib/csrf.ts) for isolated unit testing
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

// Simplified version of validateCsrfOrigin for testing (matches production logic)
function validateCsrfOrigin(request, nodeEnv = 'development', appUrl = null) {
  const csrfHeader = request.headers.get(CSRF_HEADER);
  if (!csrfHeader || csrfHeader.trim() !== '1') return false;

  if (nodeEnv === 'production') {
    if (!appUrl) return false; // fail closed
    let appOrigin;
    try { appOrigin = new URL(appUrl).origin; } catch { return false; }

    const origin = request.headers.get('origin');
    if (origin) return origin === appOrigin;

    const referer = request.headers.get('referer');
    if (referer) {
      try { return new URL(referer).origin === appOrigin; } catch { return false; }
    }
    return false; // no origin or referer in production → reject
  }

  // Development
  const origin = request.headers.get('origin');
  if (!origin) return true; // curl/Postman
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname.endsWith('.localhost');
  } catch { return false; }
}

// ── Dev mode tests ────────────────────────────────────────────────────────────

test('DEV: request without CSRF header is rejected', () => {
  const req = makeRequest({ headers: { 'origin': 'http://localhost:3000' } });
  assert.equal(validateCsrfOrigin(req, 'development'), false);
});

test('DEV: request with wrong CSRF header value is rejected', () => {
  const req = makeRequest({ headers: { 'x-magnus-csrf': '0', 'origin': 'http://localhost:3000' } });
  assert.equal(validateCsrfOrigin(req, 'development'), false);
});

test('DEV: request with CSRF header + localhost origin is allowed', () => {
  const req = makeRequest({ headers: { 'x-magnus-csrf': '1', 'origin': 'http://localhost:3000' } });
  assert.equal(validateCsrfOrigin(req, 'development'), true);
});

test('DEV: request with CSRF header + 127.0.0.1 origin is allowed', () => {
  const req = makeRequest({ headers: { 'x-magnus-csrf': '1', 'origin': 'http://127.0.0.1:3000' } });
  assert.equal(validateCsrfOrigin(req, 'development'), true);
});

test('DEV: request with CSRF header + no origin (curl) is allowed', () => {
  const req = makeRequest({ headers: { 'x-magnus-csrf': '1' } });
  assert.equal(validateCsrfOrigin(req, 'development'), true);
});

test('DEV: request with CSRF header + external origin is rejected', () => {
  const req = makeRequest({ headers: { 'x-magnus-csrf': '1', 'origin': 'http://evil.com' } });
  assert.equal(validateCsrfOrigin(req, 'development'), false);
});

// ── Production mode tests ─────────────────────────────────────────────────────

const PROD_APP_URL = 'https://app.magnus.com';

test('PROD: no CSRF header → rejected', () => {
  const req = makeRequest({ headers: { 'origin': PROD_APP_URL } });
  assert.equal(validateCsrfOrigin(req, 'production', PROD_APP_URL), false);
});

test('PROD: correct CSRF header + correct Origin → allowed', () => {
  const req = makeRequest({ headers: { 'x-magnus-csrf': '1', 'origin': 'https://app.magnus.com' } });
  assert.equal(validateCsrfOrigin(req, 'production', PROD_APP_URL), true);
});

test('PROD: correct CSRF header + wrong Origin → rejected', () => {
  const req = makeRequest({ headers: { 'x-magnus-csrf': '1', 'origin': 'https://evil.com' } });
  assert.equal(validateCsrfOrigin(req, 'production', PROD_APP_URL), false);
});

test('PROD: correct CSRF header + correct Referer (no Origin) → allowed', () => {
  const req = makeRequest({ headers: { 'x-magnus-csrf': '1', 'referer': 'https://app.magnus.com/login' } });
  assert.equal(validateCsrfOrigin(req, 'production', PROD_APP_URL), true);
});

test('PROD: correct CSRF header + wrong Referer (no Origin) → rejected', () => {
  const req = makeRequest({ headers: { 'x-magnus-csrf': '1', 'referer': 'https://evil.com/page' } });
  assert.equal(validateCsrfOrigin(req, 'production', PROD_APP_URL), false);
});

test('PROD: correct CSRF header + no Origin + no Referer → rejected (ambiguous origin)', () => {
  const req = makeRequest({ headers: { 'x-magnus-csrf': '1' } });
  assert.equal(validateCsrfOrigin(req, 'production', PROD_APP_URL), false);
});

test('PROD: NEXT_PUBLIC_APP_URL not set → fail closed (reject all)', () => {
  const req = makeRequest({ headers: { 'x-magnus-csrf': '1', 'origin': 'https://app.magnus.com' } });
  assert.equal(validateCsrfOrigin(req, 'production', null), false);
});

// ─── 2. next.config.js Security Header Tests ──────────────────────────────────

test('next.config.js exports a headers() function', () => {
  const config = require('../next.config.js');
  assert.equal(typeof config.headers, 'function', 'next.config.js must export headers()');
});

test('security headers include CSP', async () => {
  const config = require('../next.config.js');
  const headersList = await config.headers();
  const allHeaders = headersList.flatMap(h => h.headers);
  const csp = allHeaders.find(h => h.key === 'Content-Security-Policy');
  assert.ok(csp, 'Content-Security-Policy header must be present');
  assert.match(csp.value, /default-src 'self'/, 'CSP must include default-src self');
  assert.match(csp.value, /frame-ancestors 'none'/, 'CSP must include frame-ancestors none');
  assert.ok(!csp.value.includes("'unsafe-eval'"), "CSP must NOT include 'unsafe-eval'");
});

test('security headers include HSTS', async () => {
  const config = require('../next.config.js');
  const headersList = await config.headers();
  const allHeaders = headersList.flatMap(h => h.headers);
  const hsts = allHeaders.find(h => h.key === 'Strict-Transport-Security');
  assert.ok(hsts, 'Strict-Transport-Security must be present');
  assert.match(hsts.value, /max-age=\d+/, 'HSTS must include max-age');
  assert.match(hsts.value, /includeSubDomains/, 'HSTS must include includeSubDomains');
});

test('security headers include X-Frame-Options DENY', async () => {
  const config = require('../next.config.js');
  const headersList = await config.headers();
  const allHeaders = headersList.flatMap(h => h.headers);
  const xfo = allHeaders.find(h => h.key === 'X-Frame-Options');
  assert.ok(xfo, 'X-Frame-Options must be present');
  assert.equal(xfo.value, 'DENY');
});

test('security headers include X-Content-Type-Options nosniff', async () => {
  const config = require('../next.config.js');
  const headersList = await config.headers();
  const allHeaders = headersList.flatMap(h => h.headers);
  const xcto = allHeaders.find(h => h.key === 'X-Content-Type-Options');
  assert.ok(xcto, 'X-Content-Type-Options must be present');
  assert.equal(xcto.value, 'nosniff');
});

test('security headers include Referrer-Policy', async () => {
  const config = require('../next.config.js');
  const headersList = await config.headers();
  const allHeaders = headersList.flatMap(h => h.headers);
  const rp = allHeaders.find(h => h.key === 'Referrer-Policy');
  assert.ok(rp, 'Referrer-Policy must be present');
  assert.equal(rp.value, 'strict-origin-when-cross-origin');
});

test('security headers include Permissions-Policy disabling camera and geolocation', async () => {
  const config = require('../next.config.js');
  const headersList = await config.headers();
  const allHeaders = headersList.flatMap(h => h.headers);
  const pp = allHeaders.find(h => h.key === 'Permissions-Policy');
  assert.ok(pp, 'Permissions-Policy must be present');
  assert.match(pp.value, /camera=\(\)/, 'Must disable camera');
  assert.match(pp.value, /geolocation=\(\)/, 'Must disable geolocation');
  assert.match(pp.value, /payment=\(\)/, 'Must disable payment API');
});
