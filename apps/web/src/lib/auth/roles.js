/**
 * Membership role decisions for apps/web — docs/security/MEMBERSHIP-ROLES.md.
 *
 * Plain CommonJS on purpose, like ../public-surface.js: the web test suite runs
 * `node --test` against the built artifact with no TypeScript step, and the
 * tests must exercise the real predicates the auth routes use rather than a
 * re-implementation that can drift. Types are declared in roles.d.ts.
 *
 * No imports. Nothing here touches the database or the request.
 */

/**
 * MR-4: the closed set of roles a token may carry. Lowercase, exactly these.
 * `verifyAppToken` refuses anything else at the trust boundary (R6).
 */
const TOKEN_ROLES = Object.freeze(['admin', 'member']);

/** Database enum value → token role. The only place this mapping exists. */
const ENUM_TO_TOKEN = Object.freeze({ ADMIN: 'admin', MEMBER: 'member' });

/**
 * @param {unknown} value
 * @returns {value is 'admin' | 'member'}
 */
function isTokenRole(value) {
  return typeof value === 'string' && TOKEN_ROLES.includes(value);
}

/**
 * MR-4: map the membership row's enum value to the token role. Throws on an
 * unmapped value rather than guessing — an enum value added to the schema
 * without a decision here must fail a login, not mint an unknown claim.
 *
 * @param {unknown} orgRole
 * @returns {'admin' | 'member'}
 */
function toTokenRole(orgRole) {
  if (typeof orgRole === 'string' && Object.prototype.hasOwnProperty.call(ENUM_TO_TOKEN, orgRole)) {
    return ENUM_TO_TOKEN[/** @type {'ADMIN' | 'MEMBER'} */ (orgRole)];
  }
  throw new Error(`Unknown membership role: ${JSON.stringify(orgRole)}`);
}

/**
 * MR-3: a membership is active when it has no endDate or its endDate is in
 * the future. The boundary is inclusive of "ended": endDate == now is ended.
 * Mirrors the Prisma predicate in lib/session.ts validateMembership:
 *   OR: [{ endDate: null }, { endDate: { gt: now } }]
 *
 * @param {{ endDate?: Date | null } | null | undefined} membership
 * @param {Date} [now]
 * @returns {boolean}
 */
function isMembershipActive(membership, now) {
  if (!membership || typeof membership !== 'object') return false;
  const end = membership.endDate;
  if (end === null || end === undefined) return true;
  if (!(end instanceof Date) || Number.isNaN(end.getTime())) return false;
  const at = now instanceof Date ? now : new Date();
  return end.getTime() > at.getTime();
}

/**
 * MR-7: the predicate future admin-only routes use. `admin` satisfies every
 * known role; `member` satisfies only `member`. An unknown required role is
 * never satisfied, so a typo in a gate fails closed.
 *
 * @param {{ role?: unknown } | null | undefined} payload
 * @param {'admin' | 'member'} required
 * @returns {boolean}
 */
function hasRole(payload, required) {
  if (!isTokenRole(required)) return false;
  if (!payload || typeof payload !== 'object') return false;
  const actual = payload.role;
  if (!isTokenRole(actual)) return false;
  if (actual === 'admin') return true;
  return actual === required;
}

exports.TOKEN_ROLES = TOKEN_ROLES;
exports.isTokenRole = isTokenRole;
exports.toTokenRole = toTokenRole;
exports.isMembershipActive = isMembershipActive;
exports.hasRole = hasRole;
