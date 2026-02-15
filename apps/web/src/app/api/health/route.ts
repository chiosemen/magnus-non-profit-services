import { prisma } from '@magnus/db/client';

export const runtime = 'nodejs';

export async function GET() {
  await prisma.$queryRaw`SELECT 1`;
  return Response.json({ ok: true });
}

