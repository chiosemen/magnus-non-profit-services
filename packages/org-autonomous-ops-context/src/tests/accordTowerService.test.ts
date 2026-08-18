/**
 * Magnus S4NP — Phase 5 Accord Tower Service Integration & Validation Tests
 */

if (typeof require !== 'undefined') {
  try {
    const path = require('path');
    require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });
  } catch (e) {}
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient, ComplianceDeadlineType, ComplianceStatus } from '@magnus/db/types';
import { createGrant, listGrants, getGrant, NotFoundError } from '../grantService';
import { createComplianceDeadline, updateComplianceStatus, listComplianceCalendar } from '../complianceService';
import { buildExecutivePacket } from '../executivePacketService';
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
    registerDbUnavailable('S4NP Phase 5 Service tests', 'DATABASE_URL unreachable');
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
    // Clean up related records to ensure isolation
    await prisma.grant.deleteMany({ where: { orgId: org.id } });
    await prisma.complianceCalendar.deleteMany({ where: { orgId: org.id } });
    await prisma.volunteerEvent.deleteMany({ where: { orgId: org.id } });
    return org;
  };

  test('Grant Service: create, list, and get operations with validations', async () => {
    const org = await setupTestOrg('00-9511111', 'Accord Tower Grant Org');

    // 1. Validation: negative totalAmount
    await assert.rejects(
      () => createGrant(prisma, org.id, {
        funderName: 'Bill Gates Foundation',
        totalAmount: -100,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        reportingSchedule: {},
      }),
      (err: any) => {
        assert.ok(err.message.includes('Total amount cannot be negative'));
        return true;
      }
    );

    // 2. Validation: start date after end date
    await assert.rejects(
      () => createGrant(prisma, org.id, {
        funderName: 'Bill Gates Foundation',
        totalAmount: 100000,
        startDate: '2026-12-31',
        endDate: '2026-01-01',
        reportingSchedule: {},
      }),
      (err: any) => {
        assert.ok(err.message.includes('cannot be after'));
        return true;
      }
    );

    // 3. Create successfully
    const grant = await createGrant(prisma, org.id, {
      funderName: 'Bill Gates Foundation',
      totalAmount: 100000,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      reportingSchedule: { reports: ['Q1', 'Q2'] },
    });

    assert.equal(grant.funderName, 'Bill Gates Foundation');
    assert.equal(Number(grant.totalAmount), 100000);

    // 4. Retrieve grant
    const retrieved = await getGrant(prisma, org.id, grant.id);
    assert.equal(retrieved.id, grant.id);

    // 5. List grants
    const list = await listGrants(prisma, org.id);
    assert.ok(list.some(g => g.id === grant.id));
  });

  test('Compliance Service: lifecycle operations', async () => {
    const org = await setupTestOrg('00-9622222', 'Accord Tower Compliance Org');

    // 1. Create deadline
    const deadline = await createComplianceDeadline(prisma, org.id, {
      deadlineType: ComplianceDeadlineType.FORM_990,
      dueDate: '2026-05-15',
    });

    assert.equal(deadline.deadlineType, ComplianceDeadlineType.FORM_990);
    assert.equal(deadline.status, ComplianceStatus.PENDING);

    // 2. Update status
    const updated = await updateComplianceStatus(prisma, org.id, deadline.id, ComplianceStatus.FILED);
    assert.equal(updated.status, ComplianceStatus.FILED);

    // 3. List calendar
    const calendar = await listComplianceCalendar(prisma, org.id);
    assert.ok(calendar.some(c => c.id === deadline.id));
  });

  test('Executive Packet Service: aggregation & narrative logic', async () => {
    const org = await setupTestOrg('00-9733333', 'Accord Tower Exec Packet Org');

    // Set up a mock grant and compliance item
    await createGrant(prisma, org.id, {
      funderName: 'Ford Foundation',
      totalAmount: 50000,
      startDate: '2026-01-01',
      endDate: '2026-06-30',
      spentToDate: 12500,
      reportingSchedule: {},
    });

    await createComplianceDeadline(prisma, org.id, {
      deadlineType: ComplianceDeadlineType.STATE_REGISTRATION,
      dueDate: '2026-07-31',
    });

    // Create volunteer event
    await prisma.volunteerEvent.create({
      data: {
        orgId: org.id,
        hours: 15,
        occurredAt: new Date(),
        sourceSystem: 'MANUAL',
        sourceRef: `manual-ref-${Date.now()}`,
      },
    });

    const packet = await buildExecutivePacket(prisma, org.id);
    assert.equal(packet.orgId, org.id);
    assert.equal(packet.grantsSummary.totalGrantsCount, 1);
    assert.equal(packet.grantsSummary.totalGrantsAmount, 50000);
    assert.equal(packet.grantsSummary.totalSpentAmount, 12500);
    assert.equal(packet.volunteerSummary.totalHoursLogged, 15);
    assert.ok(packet.narrativeSummary.includes('Ford Foundation'));
    assert.ok(packet.narrativeSummary.includes('volunteer hours'));
  });

  test('Tenant Isolation Boundaries', async () => {
    const orgA = await setupTestOrg('00-9833333', 'Accord Tower Tenant A');
    const orgB = await setupTestOrg('00-9944444', 'Accord Tower Tenant B');

    const grantA = await createGrant(prisma, orgA.id, {
      funderName: 'Tenant A Funder',
      totalAmount: 10000,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      reportingSchedule: {},
    });

    // Tenant B cannot retrieve Tenant A's grant
    await assert.rejects(
      () => getGrant(prisma, orgB.id, grantA.id),
      (err: any) => {
        assert.ok(err instanceof NotFoundError);
        return true;
      }
    );

    // Tenant B list cannot contain Tenant A's grant
    const listB = await listGrants(prisma, orgB.id);
    assert.ok(!listB.some(g => g.id === grantA.id));
  });
})();
