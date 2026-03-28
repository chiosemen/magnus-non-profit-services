import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupIntegrationData,
  createComplianceCalendarFixture,
  createGrantFixture,
  createOrganizationFixture,
} from './dbTestUtils';

const { app } = await import('../../apps/org-dashboard-api/src/server');

const DASHBOARD_ORG_ID = '44444444-4444-4444-8444-444444444444';
const DASHBOARD_ORG_EIN = '123450001';

function createDashboardJwt(): string {
  return jwt.sign(
    { orgId: DASHBOARD_ORG_ID, role: 'user', sub: 'user-123' },
    process.env.JWT_SECRET!,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

describe('org-dashboard-api integration', () => {
  beforeEach(async () => {
    await cleanupIntegrationData([DASHBOARD_ORG_ID], {
      complianceCalendar: true,
      grant: true,
    });
    await createOrganizationFixture({
      id: DASHBOARD_ORG_ID,
      ein: DASHBOARD_ORG_EIN,
      name: 'Dashboard Test Org',
    });
    await createComplianceCalendarFixture(DASHBOARD_ORG_ID);
    await createGrantFixture(DASHBOARD_ORG_ID);
  });

  afterEach(async () => {
    await cleanupIntegrationData([DASHBOARD_ORG_ID], {
      complianceCalendar: true,
      grant: true,
    });
    vi.clearAllMocks();
  });

  it('GET /api/org/overview returns 200 with a valid JWT', async () => {
    const response = await request(app)
      .get('/api/org/overview')
      .set('Authorization', `Bearer ${createDashboardJwt()}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      organization: {
        id: DASHBOARD_ORG_ID,
        ein: DASHBOARD_ORG_EIN,
        name: 'Dashboard Test Org',
        _count: {
          complianceCalendar: 1,
          grants: 1,
          workerRelationships: 0,
          incomeTransactions: 0,
        },
      },
    });
  });
});
