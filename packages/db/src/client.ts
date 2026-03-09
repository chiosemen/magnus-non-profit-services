import { PrismaClient } from '@prisma/client';
import { encryptionExtension } from './encryptionExtension';

type GlobalWithPrisma = typeof globalThis & { __magnus_prisma__?: ReturnType<typeof createPrismaClient> };

const globalWithPrisma = globalThis as GlobalWithPrisma;

function createPrismaClient() {
  const basePrismaClient = new PrismaClient({
    // Do not enable query logging by default (may leak sensitive values).
    log: [],
    errorFormat: 'minimal',
  });

  return basePrismaClient.$extends(encryptionExtension);
}

export const prisma =
  globalWithPrisma.__magnus_prisma__ ??
  createPrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalWithPrisma.__magnus_prisma__ = prisma;
}

export default prisma;

