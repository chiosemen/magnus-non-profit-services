/**
 * Types for `roles.js` — see that file for why it is plain JS.
 * docs/security/MEMBERSHIP-ROLES.md
 */

/** MR-4 — the closed set of roles a token may carry. */
export type TokenRole = 'admin' | 'member';

/** Database enum values (mirrors Prisma's `OrgRole`). */
export type OrgRoleValue = 'ADMIN' | 'MEMBER';

export declare const TOKEN_ROLES: readonly TokenRole[];

export declare function isTokenRole(value: unknown): value is TokenRole;

/** Throws on an unmapped value — never guesses. */
export declare function toTokenRole(orgRole: unknown): TokenRole;

/** MR-3 — no endDate, or a future one. */
export declare function isMembershipActive(
  membership: { endDate?: Date | null } | null | undefined,
  now?: Date,
): boolean;

/** MR-7 — admin satisfies every role; member satisfies only member. */
export declare function hasRole(
  payload: { role?: unknown } | null | undefined,
  required: TokenRole,
): boolean;
