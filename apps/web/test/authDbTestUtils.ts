import { prisma } from '@magnus/db/client';
import { hashPassword } from '@/lib/auth/password';
import { hashRefreshToken } from '@/lib/auth/refresh';

type CleanupInput = {
  emails?: string[];
  eins?: string[];
};

type OrganizationFixture = {
  id: string;
  ein: string;
  name: string;
};

type WorkerFixture = {
  id: string;
  email: string;
  password: string;
  name?: string;
};

type UserFixture = {
  id: string;
  email: string;
  name?: string;
  passwordHash?: string;
};

type SessionFixture = {
  userId: string;
  orgId: string;
  refreshToken: string;
  expiresAt?: Date;
  revokedAt?: Date | null;
};

export async function cleanupAuthData(input: CleanupInput): Promise<void> {
  const emails = input.emails ?? [];
  const eins = input.eins ?? [];

  const organizations = eins.length > 0
    ? await prisma.organization.findMany({
        where: { ein: { in: eins } },
        select: { id: true },
      })
    : [];

  const workers = emails.length > 0
    ? await prisma.worker.findMany({
        where: { email: { in: emails } },
        select: { id: true },
      })
    : [];

  const users = emails.length > 0
    ? await prisma.user.findMany({
        where: { email: { in: emails } },
        select: { id: true },
      })
    : [];

  const orgIds = organizations.map((organization) => organization.id);
  const workerIds = workers.map((worker) => worker.id);
  const userIds = users.map((user) => user.id);

  if (orgIds.length > 0 || userIds.length > 0) {
    await prisma.session.deleteMany({
      where: {
        OR: [
          ...(orgIds.length > 0 ? [{ orgId: { in: orgIds } }] : []),
          ...(userIds.length > 0 ? [{ userId: { in: userIds } }] : []),
        ],
      },
    });
  }

  if (orgIds.length > 0 || workerIds.length > 0) {
    await prisma.workerOrgRelationship.deleteMany({
      where: {
        OR: [
          ...(orgIds.length > 0 ? [{ orgId: { in: orgIds } }] : []),
          ...(workerIds.length > 0 ? [{ workerId: { in: workerIds } }] : []),
        ],
      },
    });
  }

  if (userIds.length > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });
  }

  if (workerIds.length > 0) {
    await prisma.worker.deleteMany({
      where: { id: { in: workerIds } },
    });
  }

  if (orgIds.length > 0) {
    await prisma.organization.deleteMany({
      where: { id: { in: orgIds } },
    });
  }
}

export async function createOrganizationFixture(input: OrganizationFixture) {
  return prisma.organization.create({
    data: {
      id: input.id,
      ein: input.ein,
      name: input.name,
      subscriptionTier: 'STARTER',
      subscriptionStatus: 'ACTIVE',
    },
  });
}

export async function createWorkerFixture(input: WorkerFixture) {
  const passwordHash = await hashPassword(input.password);

  return prisma.worker.create({
    data: {
      id: input.id,
      email: input.email,
      name: input.name,
      passwordHash,
    },
  });
}

export async function createWorkerRelationshipFixture(input: {
  workerId: string;
  orgId: string;
}) {
  return prisma.workerOrgRelationship.create({
    data: {
      workerId: input.workerId,
      orgId: input.orgId,
      relationshipType: 'CONTRACTOR_1099',
      startDate: new Date('2026-03-01T00:00:00.000Z'),
      grantFunded: false,
    },
  });
}

export async function createUserFixture(input: UserFixture) {
  return prisma.user.create({
    data: {
      id: input.id,
      email: input.email,
      name: input.name ?? null,
      ...(input.passwordHash ? { passwordHash: input.passwordHash } : {}),
    },
  });
}

export async function createSessionFixture(input: SessionFixture) {
  const now = new Date('2026-03-10T00:00:00.000Z');

  return prisma.session.create({
    data: {
      userId: input.userId,
      orgId: input.orgId,
      refreshTokenHash: hashRefreshToken(input.refreshToken),
      expiresAt: input.expiresAt ?? new Date('2026-04-09T00:00:00.000Z'),
      lastSeenAt: now,
      ...(input.revokedAt === undefined ? {} : { revokedAt: input.revokedAt }),
    },
  });
}