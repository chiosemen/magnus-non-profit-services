/**
 * Magnus S4NP — Phase 5 Board Packet Generator Integration & Validation Tests
 */

if (typeof require !== 'undefined') {
  try {
    const path = require('path');
    require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });
  } catch (e) {}
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient, ConciergeProposalType } from '@magnus/db/types';
import { buildBoardPacket } from '../boardPacketService';
import { createProposal } from '../conciergeProposalService';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres@localhost/magnus';

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
    test('SKIP: S4NP Phase 5 Board Packet tests (no DB connection)', { skip: 'DATABASE_URL unreachable' }, () => {});
    return;
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: DATABASE_URL } },
  });

  const setupTestOrg = async (ein: string, name: string) => {
    const org = await prisma.organization.upsert({
      where: { ein },
      update: {},
      create: {
        name,
        ein,
        subscriptionTier: 'ENTERPRISE',
      },
    });

    // Clean up related records
    await prisma.conciergeProposal.deleteMany({ where: { orgId: org.id } });
    await prisma.donation.deleteMany({ where: { orgId: org.id } });
    await prisma.campaign.deleteMany({ where: { orgId: org.id } });
    await prisma.donor.deleteMany({ where: { orgId: org.id } });
    await prisma.complianceCalendar.deleteMany({ where: { orgId: org.id } });
    await prisma.grant.deleteMany({ where: { orgId: org.id } });
    await prisma.volunteerEvent.deleteMany({ where: { orgId: org.id } });
    await prisma.volunteer.deleteMany({ where: { orgId: org.id } });

    return org;
  };

  test('Board Packet Generator: compile packet from fixture data', async () => {
    const org = await setupTestOrg('00-3511111', 'Board Packet Test Org');

    // Seed campaign & donation
    const campaign = await prisma.campaign.create({
      data: {
        orgId: org.id,
        title: 'Gala 2026',
        slug: `gala-packet-${Date.now()}`,
      },
    });

    const donor = await prisma.donor.create({
      data: {
        orgId: org.id,
        name: 'Gala Donor',
      },
    });

    await prisma.donation.create({
      data: {
        orgId: org.id,
        donorId: donor.id,
        amount: 2500,
        receivedAt: new Date(),
        paymentMethod: 'MANUAL',
        campaignId: campaign.id,
      },
    });

    // Generate Board Packet without AI narrative
    const packet = await buildBoardPacket(prisma, org.id, { includeAiNarrative: false });

    assert.equal(packet.orgId, org.id);
    assert.equal(packet.donorActivity.totalDonorsCount, 1);
    assert.equal(packet.donorActivity.totalDonationsAmount, 2500);
    assert.equal(packet.campaignPerformance[0].totalRaised, 2500);
    assert.equal(packet.aiNarrative.status, 'DISABLED');
    assert.equal(packet.aiNarrative.content, null);
  });

  test('Board Packet Generator: approved AI narrative path works and is stamped', async () => {
    const org = await setupTestOrg('00-3622222', 'Board Packet AI Org');

    // Create a BOARD_BRIEF proposal in pending_review
    await createProposal(prisma, org.id, {
      type: ConciergeProposalType.BOARD_BRIEF,
      confidence: 0.94,
      payload: { brief: 'We are growing steadily.' },
    });

    const packet = await buildBoardPacket(prisma, org.id, { includeAiNarrative: true });
    assert.equal(packet.aiNarrative.status, 'ENABLED_DRAFT');
    assert.ok(packet.aiNarrative.content?.includes('AI GENERATED BRIEFING DRAFT'));
    assert.ok(packet.aiNarrative.content?.includes('We are growing steadily.'));
    assert.ok(packet.aiNarrative.content?.includes('94%'));
  });

  test('Board Packet Generator: cross-org isolation boundaries', async () => {
    const orgA = await setupTestOrg('00-3733333', 'Packet Tenant A');
    const orgB = await setupTestOrg('00-3844444', 'Packet Tenant B');

    // Seed campaign for Org A
    await prisma.campaign.create({
      data: {
        orgId: orgA.id,
        title: 'Campaign A',
        slug: `c-a-${Date.now()}`,
      },
    });

    const packetB = await buildBoardPacket(prisma, orgB.id, { includeAiNarrative: false });
    assert.equal(packetB.campaignPerformance.length, 0); // No Org A campaigns leaked
  });
})();
