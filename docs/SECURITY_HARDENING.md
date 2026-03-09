# Security Hardening Roadmap

**Last Updated:** 2026-03-08
**Status:** Production Readiness Assessment

This document outlines security hardening requirements for Magnus Accord platform before handling production customer data.

---

## Executive Summary

The Magnus platform demonstrates strong authentication foundations with proper JWT handling, bcrypt password hashing, and refresh token rotation. However, **critical gaps exist in encryption-at-rest for sensitive PII** that must be addressed before production deployment.

**Current Readiness: 85%**
**Blockers for Production: 2 CRITICAL issues**

---

## CRITICAL - Must Fix Before Production

### 1. Sensitive Field Encryption (BLOCKER)

**Affected Fields:**
- `Organization.plaidAccessToken` - OAuth tokens for financial account access
- `Worker.plaidAccessToken` - OAuth tokens for financial account access
- `Worker.ssnEncrypted` - Social Security Numbers (misleadingly named)

**Current State:**
❌ Marked as "encrypted" in schema comments but stored as **plaintext TEXT** in PostgreSQL

**Risk:**
Database breach exposes full access to user financial accounts (Plaid) and personally identifiable information (SSN).

**Required Fix:**
1. Implement AES-256-GCM encryption for these fields
2. Create encryption key management strategy
3. Implement key rotation procedures
4. Add encryption utilities in `packages/db/src/encryption.ts`
5. Update all read/write operations to encrypt/decrypt
6. Migration to encrypt existing data

**Compliance Impact:**
- **GDPR:** PII encryption required for data subject rights
- **PCI-DSS:** Payment-related data requires encryption-at-rest
- **SOC 2:** Encryption controls mandatory
- **CCPA/VCDPA:** Sensitive PII must be encrypted

**Estimated Effort:** 3-5 days
**Priority:** P0 - BLOCKER

---

### 2. Expired Session Cleanup (BLOCKER)

**Issue:**
Sessions with `revokedAt !== null` or past `expiresAt` accumulate indefinitely in database.

**Impact:**
- Database growth unbounded (30-day session TTL means continuous accumulation)
- Performance degradation on session queries over time
- Compliance risk (data retention policies)

**Required Fix:**
1. Create daily cron job to delete sessions older than 90 days:
   ```sql
   DELETE FROM "Session"
   WHERE ("revokedAt" IS NOT NULL AND "revokedAt" < NOW() - INTERVAL '90 days')
      OR ("expiresAt" < NOW() - INTERVAL '90 days');
   ```
2. Add to `apps/agents/src/cron/sessionCleanup.ts`
3. Schedule via node-cron at 3 AM UTC daily
4. Add monitoring/alerting on cleanup failures

**Estimated Effort:** 4 hours
**Priority:** P0 - BLOCKER

---

## HIGH PRIORITY - Fix Soon

### 3. Stripe Customer/Subscription ID Encryption

**Affected Fields:**
- `Organization.stripeAccountId`
- `Organization.stripeCustomerId`
- `Organization.stripeSubscriptionId`
- `Worker.stripeCustomerId`

**Current State:**
Stored as plaintext

**Risk:**
Medium - These IDs could be used in targeted attacks or social engineering

**Recommendation:**
Encrypt using same AES-256-GCM approach as Plaid tokens

**Estimated Effort:** 1 day (after encryption framework from #1)
**Priority:** P1

---

### 4. Rate Limiting on Token Endpoints

**Missing:**
No rate limiting on `/api/auth/refresh`, `/api/auth/login`

**Risk:**
Brute force attacks on token validation, credential stuffing

**Required Fix:**
1. Add express-rate-limit middleware
2. Limit `/api/auth/refresh` to 5 attempts/minute per IP
3. Limit `/api/auth/login` to 10 attempts/minute per IP
4. Return 429 status on rate limit exceeded

**Estimated Effort:** 2 hours
**Priority:** P1

---

### 5. Database Encryption at Rest

**Current State:**
PostgreSQL database not configured for encryption-at-rest

**Required:**
1. Enable PostgreSQL transparent data encryption (TDE)
2. Configure encrypted backups
3. Set encryption algorithm to AES-256

**Note:** This is infrastructure/DevOps work, not code changes

**Estimated Effort:** 1 day (infrastructure)
**Priority:** P1

---

## MEDIUM PRIORITY - Enhance Security Posture

### 6. Session Device Binding (Optional)

**Current State:**
`Session.ip` and `Session.userAgent` captured but not validated

**Enhancement:**
Add optional strict device binding:
- Validate IP address on refresh (with allow-list for mobile)
- Detect concurrent sessions from different locations
- Alert users on suspicious activity

**Use Case:**
High-security organizations (e.g., ENTERPRISE tier)

**Estimated Effort:** 2 days
**Priority:** P2

---

### 7. Audit Logging for Sensitive Operations

**Missing:**
No audit trail for:
- SSN/Plaid token access (decryption events)
- Session creation/revocation
- Subscription tier changes
- Admin privilege escalation

**Required:**
1. Create `AuditLog` table in schema
2. Log all sensitive field decryption with user, timestamp, IP
3. Log authentication events (login, logout, refresh, revoke)
4. Retention: 2 years for compliance

**Estimated Effort:** 3 days
**Priority:** P2

---

### 8. JWT Signature Algorithm Hardening

**Current State:**
Uses HS256 (symmetric signing with shared secret)

**Enhancement:**
Consider RS256 (asymmetric) for:
- Public key verification by other services
- Better key rotation story
- Separation of signing and validation keys

**Note:** Not required for current architecture but recommended for multi-service JWT sharing

**Estimated Effort:** 1 day
**Priority:** P3

---

### 9. Webhook Retry Idempotency Enhancement

**Current State:**
✅ Stripe webhooks now have idempotency (via StripeWebhookEvent table)
⚠️ Slack webhooks (alerts) partially idempotent

**Enhancement for Slack:**
- Add idempotency key to Slack message metadata
- Track sent messages in database
- Prevent duplicate alert notifications on retry

**Estimated Effort:** 4 hours
**Priority:** P3

---

## COMPLETED - Already Implemented

### ✅ Password Hashing
- bcryptjs with 12 salt rounds
- Timing-safe comparison
- Minimum 8 character validation

### ✅ Refresh Token Rotation
- Token rotation on every refresh
- Transactional guarantee (old token revoked atomically)
- Timing-safe verification with SHA256 hashing

### ✅ Session Revocation
- Soft-delete via `revokedAt` timestamp
- Fail-closed (cookies cleared even if DB fails)
- Multi-session revocation support

### ✅ Stripe Webhook Idempotency
- Event ID deduplication via `StripeWebhookEvent` table
- Prevents duplicate processing on Stripe retries
- Records success/failure for audit

### ✅ Cookie Security
- `httpOnly: true` (XSS protection)
- `sameSite: lax` (CSRF protection)
- `secure: true` in production (HTTPS-only)

### ✅ Route-Level Authentication
- All premium routes protected with JWT middleware
- Feature gates enforced via subscription tier checks
- Org-scoping verified at route level
- Fail-closed on invalid tokens

### ✅ Environment Validation
- All 7 apps call `validateEnv()` at startup
- Fail-closed on missing/invalid environment variables
- JWT_SECRET minimum 32 characters enforced

---

## Deferred / Out of Scope

### Database Column-Level Encryption
**Status:** Deferred
**Reason:** PostgreSQL TDE (Transparent Data Encryption) is preferred over application-layer column encryption for performance and key management simplicity. Implement TDE first (item #5), then revisit if regulatory requirements demand column-level encryption.

### Multi-Factor Authentication (MFA)
**Status:** Roadmap
**Reason:** Not a blocker for initial production launch. Add in Phase 2 based on customer demand.

### IP Allowlisting / Geofencing
**Status:** Enterprise Feature
**Reason:** ENTERPRISE tier customers may require IP restrictions. Design as configurable per-organization feature.

### Hardware Security Module (HSM) Integration
**Status:** Future
**Reason:** For very large deployments or regulated industries. Not required for initial production.

---

## Encryption Implementation Guide

### Recommended Approach: AES-256-GCM

**Why AES-256-GCM:**
- AEAD (Authenticated Encryption with Associated Data) - prevents tampering
- NIST-approved standard
- Hardware acceleration available (AES-NI)
- Node.js built-in support via `crypto` module

**Key Management:**
1. Store encryption key in environment variable: `ENCRYPTION_KEY` (64 hex chars = 32 bytes)
2. Generate via: `openssl rand -hex 32`
3. Rotate quarterly via blue-green deployment:
   - Deploy new key as `ENCRYPTION_KEY_NEW`
   - Re-encrypt all records with new key
   - Swap keys after verification
   - Revoke old key

**Implementation Example:**
```typescript
// packages/db/src/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32 bytes

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
}

export function decrypt(encrypted: string): string {
  const [ivHex, authTagHex, ciphertext] = encrypted.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}
```

**Usage:**
```typescript
// Before write
const encryptedSSN = encrypt(workerSSN);
await prisma.worker.update({ where: { id }, data: { ssnEncrypted: encryptedSSN } });

// After read
const worker = await prisma.worker.findUnique({ where: { id } });
const plainSSN = worker.ssnEncrypted ? decrypt(worker.ssnEncrypted) : null;
```

---

## Testing Requirements

**Before Production Deployment:**

1. **Penetration Testing**
   - Third-party security audit
   - OWASP Top 10 verification
   - Focus on authentication, session management, data encryption

2. **Compliance Audit**
   - GDPR readiness review
   - SOC 2 Type 1 audit (minimum)
   - State privacy law compliance check

3. **Load Testing**
   - Session creation/refresh under load
   - Webhook processing with Stripe retries
   - Database query performance with encryption

4. **Disaster Recovery**
   - Encryption key rotation drill
   - Database backup/restore with encrypted fields
   - Session recovery after DB failover

---

## Security Contact

For security issues or questions:
- **Email:** security@magnus-compliance.com
- **Encrypted:** PGP key on keybase.io/magnus
- **Bug Bounty:** TBD (post-launch)

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2026-03-08 | 1.0 | Initial security hardening roadmap |

