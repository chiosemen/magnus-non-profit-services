import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

function assertTokenLike(token: unknown, label: string): asserts token is string {
  if (typeof token !== 'string' || token.trim().length === 0) throw new Error(`Invalid ${label}`);
}

export function generateRefreshToken(): string {
  // 32 bytes of entropy encoded as URL-safe base64.
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  assertTokenLike(token, 'refresh token');
  return createHash('sha256').update(token).digest('hex');
}

export function verifyRefreshToken(token: string, expectedHashHex: string): boolean {
  assertTokenLike(token, 'refresh token');
  assertTokenLike(expectedHashHex, 'refresh token hash');

  const actualHashBuf = createHash('sha256').update(token).digest();

  const isValidHex = /^[0-9a-f]{64}$/i.test(expectedHashHex);
  const expectedHashBuf = isValidHex ? Buffer.from(expectedHashHex, 'hex') : Buffer.alloc(32);

  // Always compare same-length buffers to avoid timing leaks.
  return isValidHex && timingSafeEqual(actualHashBuf, expectedHashBuf);
}

