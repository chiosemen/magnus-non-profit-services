/**
 * Public surface decisions for apps/web — SPEC-P0 R14.
 * Spec: docs/security/PUBLIC-SURFACE-SEPARATION.md
 *
 * Deliberately plain CommonJS rather than TypeScript. The web test suite runs
 * `node --test` against the built artifact with no TS compile step, so keeping
 * these three predicates in a runnable module lets the tests exercise the real
 * decision function the middleware uses, instead of a re-implementation of it
 * that can drift. Types are declared in the sibling `public-surface.d.ts`.
 *
 * No imports, no framework types: this module is bundled into the edge
 * middleware, where the surface area of a dependency is a liability.
 */

/**
 * Paths the marketing deployment serves. PS-1 requires an allowlist rather
 * than a denylist, so that an application route added later is refused by
 * default rather than by someone remembering to block it.
 */
const MARKETING_PAGES = new Set(['/', '/book-audit']);

/** Root-level files a static marketing page legitimately requests. */
const MARKETING_FILES = new Set(['/favicon.ico', '/robots.txt', '/sitemap.xml']);

/**
 * Build assets. The trailing slash is load-bearing: a bare `/_next` prefix
 * test would also admit `/_nextjs-admin`.
 */
const ASSET_PREFIX = '/_next/';

/** The only path prefix that carries the application auth gate (P0-6). */
const APP_PREFIX = '/app/';

/**
 * Read the live environment. Accessed through `globalThis` on purpose: a
 * direct `process.env.MARKETING_ONLY` reference in middleware is a candidate
 * for build-time inlining, which would bake the mode into the artifact and
 * break PS-8 (one artifact, two environments). This indirection keeps it a
 * request-time lookup.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {Record<string, string | undefined>}
 */
function readEnv(env) {
  if (env) return env;
  const g = /** @type {{ process?: { env?: Record<string, string | undefined> } }} */ (
    /** @type {unknown} */ (globalThis)
  );
  return (g.process && g.process.env) || {};
}

/**
 * PS-4/PS-8. Strict: only the exact string `"true"` enables the gate. A
 * malformed value is rejected at boot by `assertMarketingOnlyEnvironment`
 * (@magnus/config), so the request path never has to guess what `"yes"` meant.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {boolean}
 */
function isMarketingOnly(env) {
  return readEnv(env).MARKETING_ONLY === 'true';
}

/**
 * PS-1. Exact membership — no normalisation, no case folding, no prefix
 * matching except the asset prefix above. `/book-audit/` is admitted because
 * Next's trailing-slash redirect runs after middleware; nothing else is.
 *
 * @param {string} pathname
 * @returns {boolean}
 */
function isPublicMarketingPath(pathname) {
  if (typeof pathname !== 'string' || pathname.length === 0) return false;
  if (MARKETING_PAGES.has(pathname) || MARKETING_FILES.has(pathname)) return true;
  if (pathname.length > 1 && pathname.endsWith('/') && MARKETING_PAGES.has(pathname.slice(0, -1))) {
    return true;
  }
  return pathname.startsWith(ASSET_PREFIX);
}

/**
 * PS-6. The application auth boundary is unchanged: `/app` and everything
 * beneath it, nothing else. Widening the middleware matcher must not widen
 * this.
 *
 * @param {string} pathname
 * @returns {boolean}
 */
function requiresAuthGate(pathname) {
  if (typeof pathname !== 'string') return false;
  return pathname === '/app' || pathname.startsWith(APP_PREFIX);
}

exports.isMarketingOnly = isMarketingOnly;
exports.isPublicMarketingPath = isPublicMarketingPath;
exports.requiresAuthGate = requiresAuthGate;
