import { afterAll, beforeAll } from 'vitest';
import { prisma } from '@magnus/db/client';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.MAGNUS_TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/magnus';
process.env.JWT_SECRET ??= 'test-jwt-secret-must-be-at-least-32-chars-long';
process.env.ENCRYPTION_KEY ??=
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});