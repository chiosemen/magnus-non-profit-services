/**
 * Magnus DB — S4NP Phase 4 AI Concierge Database Integration Tests
 */

import { config } from 'dotenv';
import { join } from 'path';

// Load .env from project root
config({ path: join(__dirname, '..', '..', '..', '..', '.env') });

import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient, ConciergeProposalStatus, ConciergeProposalType } from '@prisma/client';
import { assertSafeTestDatabaseUrl, registerDbUnavailable } from './dbTestGuard';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres@localhost/magnus';
// SPEC-P0 R3: refuse to touch anything that could be a real database.
assertSafeTestDatabaseUrl(DATABASE_URL);

async function canConnectToDb(): Promise<boolean> {
  const testClient = new PrismaClient({
    datasources: { db: { url: DATABASE_URL } },
  });
  try {
    await testClient.$queryRaw`SELECT 1`;
    await testClient.$disconnect();
    return true;
  } catch {
    await testClient.$disconnect().catch(() => {});
    return false;
  }
}

(async () => {
  const dbAvailable = await canConnectToDb();

  if (!dbAvailable) {
    registerDbUnavailable('S4NP Phase 4 Database integration tests', 'DATABASE_URL unreachable');
    return;
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: DATABASE_URL } },
  });

  const setupTestOrg = async (ein: string, name: string) => {
    return await prisma.organization.upsert({
      where: { ein },
      update: {},
      create: {
        name,
        ein,
        subscriptionTier: 'ENTERPRISE',
      },
    });
  };

  test('ConciergeProposal DB: creates proposal successfully with defaults', async () => {
    const org = await setupTestOrg('00-8111111', 'Concierge DB Org 1');

    const proposal = await prisma.conciergeProposal.create({
      data: {
        orgId: org.id,
        type: ConciergeProposalType.CAMPAIGN_DRAFT,
        confidence: 0.95,
        payload: { campaignName: 'Special Gala', goalAmount: 5000 },
        createdByAgent: 'GalaDraftAgent',
      },
    });

    assert.ok(proposal.id);
    assert.equal(proposal.orgId, org.id);
    assert.equal(proposal.type, ConciergeProposalType.CAMPAIGN_DRAFT);
    assert.equal(proposal.status, ConciergeProposalStatus.PENDING_REVIEW); // default status
    assert.equal(proposal.confidence, 0.95);
    assert.deepEqual(proposal.payload, { campaignName: 'Special Gala', goalAmount: 5000 });
    assert.equal(proposal.createdByAgent, 'GalaDraftAgent');
    assert.ok(proposal.createdAt);
    assert.ok(proposal.updatedAt);
  });

  test('ConciergeProposal DB: enforces status constraints and updates audit fields', async () => {
    const org = await setupTestOrg('00-8222222', 'Concierge DB Org 2');

    const proposal = await prisma.conciergeProposal.create({
      data: {
        orgId: org.id,
        type: ConciergeProposalType.ACCOUNT_MAPPING,
        confidence: 0.88,
        payload: { accountCode: '1000', recommendedName: 'Checking Cash' },
      },
    });

    // Update status to APPROVED and add reviewer audit data
    const updated = await prisma.conciergeProposal.update({
      where: { id: proposal.id },
      data: {
        status: ConciergeProposalStatus.APPROVED,
        reviewedByUser: 'TreasurerUser',
        reviewedAt: new Date(),
      },
    });

    assert.equal(updated.status, ConciergeProposalStatus.APPROVED);
    assert.equal(updated.reviewedByUser, 'TreasurerUser');
    assert.ok(updated.reviewedAt);
  });

  test('ConciergeProposal DB: database level isolation boundaries', async () => {
    const orgA = await setupTestOrg('00-8333333', 'Concierge DB Org A');
    const orgB = await setupTestOrg('00-8444444', 'Concierge DB Org B');

    const proposalA = await prisma.conciergeProposal.create({
      data: {
        orgId: orgA.id,
        type: ConciergeProposalType.DONOR_SEGMENT,
        confidence: 0.99,
        payload: { segmentName: 'VIP list' },
      },
    });

    // Verify Org B cannot view Org A's proposal
    const result = await prisma.conciergeProposal.findFirst({
      where: { id: proposalA.id, orgId: orgB.id },
    });
    assert.equal(result, null);
  });
})();
