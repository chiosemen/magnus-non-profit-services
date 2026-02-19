import { PrismaClient } from '@prisma/client';

type GlobalWithPrisma = typeof globalThis & { __magnus_prisma__?: PrismaClient };

const globalWithPrisma = globalThis as GlobalWithPrisma;

export const prisma: PrismaClient =
  globalWithPrisma.__magnus_prisma__ ??
  new PrismaClient({
    // Do not enable query logging by default (may leak sensitive values).
    log: [],
    errorFormat: 'minimal',
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalWithPrisma.__magnus_prisma__ = prisma;
}

export default prisma;

