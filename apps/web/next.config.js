/**
 * Magnus Web — Next.js Configuration
 *
 * Security headers are applied to ALL routes via the headers() function.
 * Review each directive before changing production values.
 *
 * CSP design decisions:
 * - `default-src 'self'` — baseline for all resource types
 * - `script-src 'self' 'unsafe-inline'` — Next.js requires inline scripts for
 *   __NEXT_DATA__ and hydration; 'unsafe-eval' is intentionally excluded.
 * - `connect-src 'self'` — API calls only to same origin (add 3rd-party APIs here)
 * - `img-src 'self' data: blob:` — Next.js Image Optimization uses blob: URLs
 * - `font-src 'self'` — no external font CDNs; add fonts.gstatic.com if needed
 * - `frame-ancestors 'none'` — prevents clickjacking (equivalent to X-Frame-Options: DENY)
 * - `upgrade-insecure-requests` — production only; upgrades any stray http:// requests
 *
 * The NEXT_PUBLIC_APP_URL env var pins the self-origin for CSRF enforcement.
 * It is optional here but validated at startup when CSRF enforcement runs.
 */

const isDev = process.env.NODE_ENV !== 'production';

// Fail early if canonical validation fails
if (process.env.SKIP_ENV_VALIDATION !== 'true') {
  require('@magnus/config/dist/envValidator').validateEnvForService('web');
}

const ContentSecurityPolicy = [
  "default-src 'self'",
  // Next.js inline scripts required for hydration; no eval
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Clickjacking prevention (supersedes X-Frame-Options)
  "frame-ancestors 'none'",
  // Force HTTPS for all subresources in production
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@magnus/org-autonomous-ops-context'],

  async headers() {
    return [
      {
        // Apply to all routes
        source: '/(.*)',
        headers: [
          // ── Content Security Policy ──────────────────────────────────
          {
            key: 'Content-Security-Policy',
            value: ContentSecurityPolicy,
          },
          // ── Transport Security ────────────────────────────────────────
          // max-age=63072000 = 2 years; includeSubDomains required for HSTS preload
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // ── Clickjacking Prevention ───────────────────────────────────
          // CSP frame-ancestors is the modern standard; DENY kept for older proxies
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          // ── MIME Sniffing Prevention ──────────────────────────────────
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // ── Referrer Policy ───────────────────────────────────────────
          // strict-origin-when-cross-origin: send full URL same-origin,
          // only origin cross-origin (no path), nothing on downgrade
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // ── Permissions Policy ────────────────────────────────────────
          // Disable all browser APIs not needed by the app
          {
            key: 'Permissions-Policy',
            value: [
              'camera=()',
              'microphone=()',
              'geolocation=()',
              'payment=()',
              'usb=()',
              'magnetometer=()',
              'gyroscope=()',
              'accelerometer=()',
            ].join(', '),
          },
          // ── XSS Protection (legacy browsers) ─────────────────────────
          // Modern browsers use CSP; this header covers IE11 and old Edge
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          // ── Cross-Origin Policies ─────────────────────────────────────
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'same-origin',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
