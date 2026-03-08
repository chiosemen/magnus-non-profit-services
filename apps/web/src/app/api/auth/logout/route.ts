import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@magnus/db/client';
import { hashRefreshToken } from '@/lib/auth/refresh';
import { clearAuthCookies } from '@/lib/auth/cookies';

export const runtime = 'nodejs';

export async function POST() {
  const refreshToken = cookies().get('refresh')?.value;

  // Revoke session in DB if we have a valid refresh token
  if (refreshToken) {
    try {
      const refreshTokenHash = hashRefreshToken(refreshToken);
      await prisma.session.updateMany({
        where: { refreshTokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Fail closed: if revocation fails, still clear cookies
    }
  }

  const res = NextResponse.json({ ok: true }, {
    status: 200,
    headers: { location: '/login' },
  });
  clearAuthCookies(res);
  return res;
}
