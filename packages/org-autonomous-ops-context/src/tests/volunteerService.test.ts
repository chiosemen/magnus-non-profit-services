/**
 * Magnus S4NP — Phase 5 Volunteer & Event Modules Integration & Validation Tests
 */

if (typeof require !== 'undefined') {
  try {
    const path = require('path');
    require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });
  } catch (e) {}
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient, EventRegistrationStatus } from '@magnus/db/types';
import {
  createVolunteer,
  listVolunteers,
  logVolunteerHours,
  createEvent,
  listEvents,
  registerAttendee,
  createSponsorshipTier,
} from '../volunteerService';
import { buildExecutivePacket } from '../executivePacketService';
import { createDonor } from '../donorCrmService';
import { createCampaign } from '../campaignService';

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
    test('SKIP: S4NP Phase 5 Volunteer & Event tests (no DB connection)', { skip: 'DATABASE_URL unreachable' }, () => {});
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
    await prisma.sponsorshipTier.deleteMany({ where: { orgId: org.id } });
    await prisma.eventRegistration.deleteMany({ where: { orgId: org.id } });
    await prisma.volunteerEvent.deleteMany({ where: { orgId: org.id } });
    await prisma.event.deleteMany({ where: { orgId: org.id } });
    await prisma.volunteer.deleteMany({ where: { orgId: org.id } });
    await prisma.campaign.deleteMany({ where: { orgId: org.id } });
    await prisma.donor.deleteMany({ where: { orgId: org.id } });

    return org;
  };

  test('Volunteer Profile: create, list, and link donor', async () => {
    const org = await setupTestOrg('00-2511111', 'Volunteer Profile Org');

    // 1. Create a donor first
    const donor = await createDonor(prisma, org.id, {
      name: 'Alice Donor',
      email: 'alice@example.com',
    });

    // 2. Create volunteer profile linked to donor
    const volunteer = await createVolunteer(prisma, org.id, {
      name: 'Alice Volunteer',
      email: 'alice@example.com',
      phone: '123-456-7890',
      donorId: donor.id,
    });

    assert.equal(volunteer.name, 'Alice Volunteer');
    assert.equal(volunteer.donorId, donor.id);

    // 3. List volunteers
    const list = await listVolunteers(prisma, org.id);
    assert.ok(list.some(v => v.id === volunteer.id));

    // 4. Unique email validation
    await assert.rejects(
      () => createVolunteer(prisma, org.id, {
        name: 'Alice Duplicate',
        email: 'alice@example.com',
      }),
      (err: any) => {
        assert.ok(err.message.includes('already exists'));
        return true;
      }
    );
  });

  test('Event & Registration lifecycle', async () => {
    const org = await setupTestOrg('00-2622222', 'Event & Reg Org');

    // Create Campaign
    const campaign = await createCampaign(prisma, org.id, {
      title: 'Summer Gala 2026',
      slug: `gala-${Date.now()}`,
    });

    // 1. Create Event linking to Campaign
    const event = await createEvent(prisma, org.id, {
      name: 'Charity Dinner',
      startDate: '2026-07-15T18:00:00Z',
      endDate: '2026-07-15T22:00:00Z',
      campaignId: campaign.id,
    });

    assert.equal(event.name, 'Charity Dinner');
    assert.equal(event.campaignId, campaign.id);

    // 2. Create Volunteer
    const volunteer = await createVolunteer(prisma, org.id, {
      name: 'Bob Volunteer',
    });

    // 3. Register Attendee
    const reg = await registerAttendee(prisma, org.id, {
      eventId: event.id,
      volunteerId: volunteer.id,
    });

    assert.equal(reg.status, EventRegistrationStatus.REGISTERED);

    // 4. Update status to ATTENDED
    const updatedReg = await registerAttendee(prisma, org.id, {
      eventId: event.id,
      volunteerId: volunteer.id,
      status: EventRegistrationStatus.ATTENDED,
    });

    assert.equal(updatedReg.status, EventRegistrationStatus.ATTENDED);

    // 5. List events
    const eventsList = await listEvents(prisma, org.id);
    assert.ok(eventsList.some(e => e.id === event.id));
  });

  test('Sponsorship Tiers and Hours Log', async () => {
    const org = await setupTestOrg('00-2733333', 'Sponsorship and Hours Org');

    const campaign = await createCampaign(prisma, org.id, {
      title: 'Green Earth Drive',
      slug: `green-earth-${Date.now()}`,
    });

    // 1. Create Sponsorship Tier
    const tier = await createSponsorshipTier(prisma, org.id, {
      campaignId: campaign.id,
      name: 'Gold Sponsor',
      amount: 5000,
      description: 'VIP seating and banner logo',
    });

    assert.equal(tier.name, 'Gold Sponsor');
    assert.equal(Number(tier.amount), 5000);

    // 2. Create Volunteer and log hours
    const volunteer = await createVolunteer(prisma, org.id, { name: 'Charlie' });
    const log = await logVolunteerHours(prisma, org.id, {
      volunteerId: volunteer.id,
      hours: 4.5,
      date: '2026-05-28',
      activityLabel: 'Greenhouse setup',
    });

    assert.equal(Number(log.hours), 4.5);
    assert.equal(log.volunteerId, volunteer.id);

    // 3. Verify board summary includes logged hours
    const packet = await buildExecutivePacket(prisma, org.id);
    assert.equal(packet.volunteerSummary.totalHoursLogged, 4.5);
    assert.equal(packet.volunteerSummary.totalEventsCount, 1);
  });

  test('Org Isolation boundaries for Volunteers and Events', async () => {
    const orgA = await setupTestOrg('00-2844444', 'Volunteer Tenant A');
    const orgB = await setupTestOrg('00-2955555', 'Volunteer Tenant B');

    const volA = await createVolunteer(prisma, orgA.id, { name: 'Volunteer A' });

    // Org B cannot list Org A's volunteer
    const listB = await listVolunteers(prisma, orgB.id);
    assert.ok(!listB.some(v => v.id === volA.id));

    // Org B cannot log hours for Org A's volunteer
    await assert.rejects(
      () => logVolunteerHours(prisma, orgB.id, {
        volunteerId: volA.id,
        hours: 5,
        date: '2026-05-28',
      }),
      (err: any) => {
        assert.ok(err.name === 'NotFoundError');
        return true;
      }
    );
  });
})();
