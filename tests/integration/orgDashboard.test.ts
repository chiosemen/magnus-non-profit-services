import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import {
  cleanupIntegrationData,
  createComplianceCalendarFixture,
  createGrantFixture,
  createOrganizationFixture,
} from './dbTestUtils.ts';

const ORG_ID = '44444444-4444-4444-8444-444444444444';
const ORG_EIN = '123450001';

const { app } = await import('../../apps/org-dashboard-api/src/server');

function createDashboardJwt(): string {
  return jwt.sign(
    { orgId: ORG_ID, role: 'user', sub: 'user-123' },
    process.env.JWT_SECRET!,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

describe('org-dashboard-api integration', () => {
  beforeEach(async () => {
    await cleanupIntegrationData([ORG_ID], {
      complianceCalendar: true,
      grant: true,
    });
    await createOrganizationFixture({
      id: ORG_ID,
      ein: ORG_EIN,
      name: 'Dashboard Test Org',
      subscriptionTier: 'ENTERPRISE',
    });
    await createComplianceCalendarFixture(ORG_ID);
    await createGrantFixture(ORG_ID);
  });

  afterEach(async () => {
    await cleanupIntegrationData([ORG_ID], {
      complianceCalendar: true,
      grant: true,
    });
  });

  it('GET /api/org/overview returns 200 with a valid JWT', async () => {
    const response = await request(app)
      .get('/api/org/overview')
      .set('Authorization', `Bearer ${createDashboardJwt()}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      organization: {
        id: ORG_ID,
        ein: ORG_EIN,
        name: 'Dashboard Test Org',
      },
    });
  });
});
