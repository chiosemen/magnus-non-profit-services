import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanupIntegrationData, createOrganizationFixture } from './dbTestUtils.ts';

const ORG_GROWTH = '66666666-6666-6666-8666-666666666666';
const ORG_ENTERPRISE = '77777777-7777-7777-8777-777777777777';
const EIN_G = '123450099';
const EIN_E = '123450088';

const { app } = await import('../../apps/org-dashboard-api/src/server');

function tokenFor(orgId: string): string {
  return jwt.sign({ orgId, role: 'user', sub: 'user-waves456' }, process.env.JWT_SECRET!, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

const cleanupOpts = {
  complianceCalendar: true,
  grant: true,
  donationGift: true,
  donationCampaign: true,
  volunteerTimeEntry: true,
  volunteerAssignment: true,
  volunteerProfile: true,
} as const;

describe('Waves 4–6 org-dashboard-api', () => {
  beforeEach(async () => {
    await cleanupIntegrationData([ORG_GROWTH, ORG_ENTERPRISE], cleanupOpts);
    await createOrganizationFixture({
      id: ORG_GROWTH,
      ein: EIN_G,
      name: 'Waves Growth Org',
      subscriptionTier: 'GROWTH',
    });
    await createOrganizationFixture({
      id: ORG_ENTERPRISE,
      ein: EIN_E,
      name: 'Waves Enterprise Org',
      subscriptionTier: 'ENTERPRISE',
    });
  });

  afterEach(async () => {
    await cleanupIntegrationData([ORG_GROWTH, ORG_ENTERPRISE], cleanupOpts);
  });

  it('GROWTH: donor summary and gift ingest', async () => {
    const auth = tokenFor(ORG_GROWTH);
    const post = await request(app)
      .post('/api/org/donor-operations/gifts')
      .set('Authorization', `Bearer ${auth}`)
      .send({
        gifts: [
          {
            donorKey: 'k1',
            amount: 100,
            giftDate: '2025-01-15T12:00:00.000Z',
            isRecurring: false,
            sourceSystem: 'test',
          },
          {
            donorKey: 'k1',
            amount: 150,
            giftDate: '2026-01-10T12:00:00.000Z',
            isRecurring: true,
            sourceSystem: 'test',
          },
        ],
      });
    expect(post.status).toBe(201);
    expect(post.body.gifts).toHaveLength(2);

    const sum = await request(app)
      .get('/api/org/donor-operations/summary')
      .set('Authorization', `Bearer ${auth}`);
    expect(sum.status).toBe(200);
    expect(sum.body.giftCount).toBe(2);
    expect(sum.body.coverage.level).toBe('weak');
    expect(sum.body.donorDataStatus).toBe('INSUFFICIENT_DATA');
    expect(sum.body.portfolio.totalDonors).toBe(1);
    expect(sum.body.portfolio.activeDonors).toBe(1);
    expect(sum.body.formulas).toBeDefined();
  });

  it('GROWTH: donor summary NOT_CONFIGURED with no gifts', async () => {
    const auth = tokenFor(ORG_GROWTH);
    const sum = await request(app)
      .get('/api/org/donor-operations/summary')
      .set('Authorization', `Bearer ${auth}`);
    expect(sum.status).toBe(200);
    expect(sum.body.donorDataStatus).toBe('NOT_CONFIGURED');
    expect(sum.body.portfolio.totalDonors).toBe(0);
  });

  it('GROWTH: denies executive-summary', async () => {
    const res = await request(app)
      .get('/api/org/executive-summary')
      .set('Authorization', `Bearer ${tokenFor(ORG_GROWTH)}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FEATURE_NOT_ENABLED');
  });

  it('ENTERPRISE: executive-summary returns section keys and disclaimer', async () => {
    const res = await request(app)
      .get('/api/org/executive-summary')
      .set('Authorization', `Bearer ${tokenFor(ORG_ENTERPRISE)}`);
    expect(res.status).toBe(200);
    expect(res.body.disclaimer).toContain('No cross-module health score');
    expect(res.body.sections.compliance).toBeDefined();
    expect(res.body.sections.donorOperations).toBeDefined();
    expect(res.body.sections.volunteerOperations).toBeDefined();
    expect(res.body.sections.volunteerOperations.summary.volunteerDataStatus).toBe('NOT_CONFIGURED');
    expect(res.body.sections.volunteerOperations.coverage).toBe('unavailable');
  });

  it('GROWTH: volunteer profile, settings, time entry, summary', async () => {
    const auth = tokenFor(ORG_GROWTH);
    const prof = await request(app)
      .post('/api/org/volunteer-operations/profiles')
      .set('Authorization', `Bearer ${auth}`)
      .send({ displayName: 'Alex V.' });
    expect(prof.status).toBe(201);
    const vid = prof.body.profile.id as string;

    const settings = await request(app)
      .put('/api/org/volunteer-operations/settings')
      .set('Authorization', `Bearer ${auth}`)
      .send({ volunteerHourlyRateUsd: 28.5 });
    expect(settings.status).toBe(200);

    const entry = await request(app)
      .post('/api/org/volunteer-operations/time-entries')
      .set('Authorization', `Bearer ${auth}`)
      .send({
        volunteerId: vid,
        programLabel: 'After school',
        hours: 3.5,
        occurredAt: '2026-03-01T15:00:00.000Z',
      });
    expect(entry.status).toBe(201);

    const entry2 = await request(app)
      .post('/api/org/volunteer-operations/time-entries')
      .set('Authorization', `Bearer ${auth}`)
      .send({
        volunteerId: vid,
        programLabel: 'After school',
        hours: 2,
        occurredAt: '2026-04-10T15:00:00.000Z',
      });
    expect(entry2.status).toBe(201);

    const entry3 = await request(app)
      .post('/api/org/volunteer-operations/time-entries')
      .set('Authorization', `Bearer ${auth}`)
      .send({
        volunteerId: vid,
        programLabel: 'Events',
        hours: 1,
        occurredAt: '2026-05-15T15:00:00.000Z',
      });
    expect(entry3.status).toBe(201);

    const sum = await request(app)
      .get('/api/org/volunteer-operations/summary')
      .set('Authorization', `Bearer ${auth}`);
    expect(sum.status).toBe(200);
    expect(sum.body.volunteerDataStatus).toBe('OK');
    expect(sum.body.totals.totalHours).toBe(6.5);
    expect(sum.body.totals.timeEntryCount).toBe(3);
    expect(sum.body.totals.volunteersWithHoursLast365).toBe(1);
    expect(sum.body.assumptions.inKindEstimateUsd).toBeCloseTo(6.5 * 28.5, 5);
    expect(sum.body.assumptions.valuationDisclaimer).toContain('Illustrative');
  });
});
