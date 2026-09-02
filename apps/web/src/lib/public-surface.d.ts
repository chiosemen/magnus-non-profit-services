/**
 * Types for `public-surface.js` — see that file for why it is plain JS.
 * SPEC-P0 R14 · docs/security/PUBLIC-SURFACE-SEPARATION.md
 */

/** PS-4/PS-8 — true only when MARKETING_ONLY is exactly the string "true". */
export declare function isMarketingOnly(env?: Record<string, string | undefined>): boolean;

/** PS-1 — allowlist membership for the marketing deployment. */
export declare function isPublicMarketingPath(pathname: string): boolean;

/** PS-6 — whether the P0-6 auth gate applies to this path. */
export declare function requiresAuthGate(pathname: string): boolean;
