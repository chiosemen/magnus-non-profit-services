import { prisma } from '@magnus/db/client';

export { prisma };
export type DbClient = typeof prisma;

