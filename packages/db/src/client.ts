import { PrismaClient } from '@prisma/client';
import { encryptionExtension } from './encryptionExtension';

type GlobalWithPrisma = typeof globalThis & { __magnus_prisma__?: PrismaClient };

const globalWithPrisma = globalThis as GlobalWithPrisma;

const createPrismaClient = (): PrismaClient => {
  const client = new PrismaClient({
    // Do not enable query logging by default (may leak sensitive values).
    log: [],
    errorFormat: 'minimal',
  });
  // Apply extension at runtime, but trick TypeScript into keeping the base PrismaClient type
  // This ensures $queryRawUnsafe and internal query shapes remain available for tests and ops
  return client.$extends(encryptionExtension) as unknown as PrismaClient;
};

export const prisma: PrismaClient =
  globalWithPrisma.__magnus_prisma__ ?? createPrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalWithPrisma.__magnus_prisma__ = prisma;
}

export default prisma;
export * from '@prisma/client';
export * from './schemaGuards';
export { encryptValue, decryptValue } from './encryptionExtension';
