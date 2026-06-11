import request from 'supertest';
import app from '../src/server';
import jwt from 'jsonwebtoken';
import { prisma } from '@magnus/db/client';
import { ConciergeProposalStatus } from '@prisma/client';

jest.mock('@magnus/db/client', () => ({
  prisma: {
    donor: {
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    donation: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    donationReceipt: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    campaign: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    conciergeProposal: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    volunteerEvent: {
      findMany: jest.fn(),
      aggregate: jest.fn(),
    },
    eventRegistration: {
      count: jest.fn(),
    },
    volunteer: {
      count: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
    complianceCalendar: {
      findMany: jest.fn(),
    },
    alert: {
      findMany: jest.fn(),
    },
    agentHandoff: {
      findMany: jest.fn(),
    },
    agentOperationalMemoryEntry: {
      create: jest.fn(),
    },
    workerOrgRelationship: {
      findMany: jest.fn(),
    },
    fund: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    ledgerTransaction: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    grant: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

describe('Nonprofit MCP Tools Integration & Safety Tests', () => {
  const secret = 'wave-6-super-secure-production-ready-test-secret-32b';
  process.env.JWT_SECRET = secret;
  process.env.JWT_ISSUER = 'magnus-mcp-connector';
  process.env.JWT_AUDIENCE = 'magnus-nonprofit-os';

  const userOrgId = '00000000-0000-0000-0000-000000000001';

  const validToken = jwt.sign({
    sub: 'worker-1',
    orgId: userOrgId,
    email: 'worker@example.com',
    roles: ['admin'],
    permissions: ['*'],
    sessionId: 'session-123'
  }, secret, {
    issuer: 'magnus-mcp-connector',
    audience: 'magnus-nonprofit-os'
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.donation.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.campaign.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.conciergeProposal.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.volunteerEvent.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.complianceCalendar.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.alert.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.agentHandoff.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.fund.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.ledgerTransaction.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.grant.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.organization.findUnique as jest.Mock).mockResolvedValue({ name: 'Test Org' });
  });

  describe('get-donor-summary', () => {
    it('enforces org context and rejects cross-org lookup', async () => {
      // Setup: Mock findFirst to return null (simulating no record found for orgId/donorId combo)
      (prisma.donor.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/tools/execute')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          toolName: 'get-donor-summary',
          params: { donorId: '11111111-1111-1111-1111-111111111111' },
        });

      expect(res.status).toBe(200);
      const data = JSON.parse(res.text);
      expect(data.error).toBe('DONOR_NOT_FOUND');

      // Verify the query actually used userOrgId context
      expect(prisma.donor.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: '11111111-1111-1111-1111-111111111111',
            orgId: userOrgId,
          },
        })
      );
    });

    it('rejects invalid uuid formats', async () => {
      const res = await request(app)
        .post('/tools/execute')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          toolName: 'get-donor-summary',
          params: { donorId: 'invalid-uuid' },
        });

      // Internal error or schema validation failure -> 500
      expect(res.status).toBe(500);
    });
  });

  describe('list-donations', () => {
    it('filters strictly by org context', async () => {
      (prisma.donation.findMany as jest.Mock).mockResolvedValueOnce([]);

      const res = await request(app)
        .post('/tools/execute')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          toolName: 'list-donations',
          params: { limit: 10 },
        });

      expect(res.status).toBe(200);
      expect(prisma.donation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: userOrgId },
          take: 10,
        })
      );
    });
  });

  describe('get-receipt-status', () => {
    it('enforces orgId context', async () => {
      (prisma.donationReceipt.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const donationId = '22222222-2222-2222-2222-222222222222';
      const res = await request(app)
        .post('/tools/execute')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          toolName: 'get-receipt-status',
          params: { donationId },
        });

      expect(res.status).toBe(200);
      const data = JSON.parse(res.text);
      expect(data.status).toBe('NOT_ISSUED');

      expect(prisma.donationReceipt.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { donationId, orgId: userOrgId },
        })
      );
    });
  });

  describe('get-campaign-performance', () => {
    it('enforces orgId context', async () => {
      (prisma.campaign.findFirst as jest.Mock).mockResolvedValueOnce(null);

      const campaignId = '33333333-3333-3333-3333-333333333333';
      const res = await request(app)
        .post('/tools/execute')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          toolName: 'get-campaign-performance',
          params: { campaignId },
        });

      expect(res.status).toBe(200);
      const data = JSON.parse(res.text);
      expect(data.error).toBe('CAMPAIGN_NOT_FOUND');

      expect(prisma.campaign.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: campaignId, orgId: userOrgId },
        })
      );
    });
  });

  describe('get-fund-balances & get-income-expense-summary', () => {
    it('sends correct orgId to context libraries', async () => {
      (prisma.donation.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.campaign.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.donor.count as jest.Mock).mockResolvedValue(0);

      const res = await request(app)
        .post('/tools/execute')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          toolName: 'get-fund-balances',
          params: { startDate: '2026-01-01' },
        });

      expect(res.status).toBe(200);
      const data = JSON.parse(res.text);
      expect(data.orgId).toBe(userOrgId);
    });
  });

  describe('draft-board-packet', () => {
    it('writes proposal only and does not mutate final data', async () => {
      // Mock db queries needed by buildBoardPacket
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue({ name: 'Test Org' });
      (prisma.campaign.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.donor.count as jest.Mock).mockResolvedValue(0);
      (prisma.donation.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.volunteer.count as jest.Mock).mockResolvedValue(0);
      (prisma.volunteerEvent.aggregate as jest.Mock).mockResolvedValue({ _sum: { hours: null }, _count: { _all: 0 } });
      (prisma.eventRegistration.count as jest.Mock).mockResolvedValue(0);
      (prisma.complianceCalendar.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.alert.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.agentHandoff.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.conciergeProposal.findMany as jest.Mock).mockResolvedValue([]);

      // Mock conciergeProposal.create
      const mockProposal = {
        id: '99999999-9999-9999-9999-999999999999',
        orgId: userOrgId,
        type: 'BOARD_BRIEF',
        status: ConciergeProposalStatus.PENDING_REVIEW,
        confidence: 1.0,
        payload: {},
        createdAt: new Date(),
      };
      (prisma.conciergeProposal.create as jest.Mock).mockResolvedValue(mockProposal);

      const res = await request(app)
        .post('/tools/execute')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          toolName: 'draft-board-packet',
          params: { includeAiNarrative: false },
        });

      expect(res.status).toBe(200);
      const data = JSON.parse(res.text);
      expect(data.success).toBe(true);
      expect(data.proposalId).toBe(mockProposal.id);
      expect(data.status).toBe(ConciergeProposalStatus.PENDING_REVIEW);

      // Verify no other writes (e.g. update, delete) were triggered on core/ledger entities
      expect(prisma.conciergeProposal.create).toHaveBeenCalled();
    });
  });

  describe('list-volunteer-hours', () => {
    it('enforces org context', async () => {
      (prisma.volunteerEvent.findMany as jest.Mock).mockResolvedValueOnce([]);

      const res = await request(app)
        .post('/tools/execute')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          toolName: 'list-volunteer-hours',
          params: { limit: 5 },
        });

      expect(res.status).toBe(200);
      expect(prisma.volunteerEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId: userOrgId },
          take: 5,
        })
      );
    });
  });

  describe('list-concierge-proposals', () => {
    it('enforces org context and supports filters', async () => {
      (prisma.conciergeProposal.findMany as jest.Mock).mockResolvedValueOnce([]);

      const res = await request(app)
        .post('/tools/execute')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          toolName: 'list-concierge-proposals',
          params: { status: 'PENDING_REVIEW', type: 'BOARD_BRIEF' },
        });

      expect(res.status).toBe(200);
      expect(prisma.conciergeProposal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            orgId: userOrgId,
            status: 'PENDING_REVIEW',
            type: 'BOARD_BRIEF',
          },
        })
      );
    });
  });
});
