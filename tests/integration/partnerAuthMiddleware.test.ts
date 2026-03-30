import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '@magnus/db/client';
import { requirePartnerAdmin, requirePartnerContext } from '../../apps/org-dashboard-api/src/partnerAuthMiddleware';

vi.mock('@magnus/db/client', () => ({
  default: {
    institutionalPartner: { findUnique: vi.fn() },
    partnerUser: { findUnique: vi.fn() },
  },
}));

describe('partner auth middleware', () => {
  beforeEach(() => {
    vi.mocked(prisma.institutionalPartner.findUnique).mockReset();
    vi.mocked(prisma.partnerUser.findUnique).mockReset();
  });

  it('requirePartnerContext returns PARTNER_CONTEXT_REQUIRED without partnerId', async () => {
    const mw = requirePartnerContext();
    const req: any = { auth: { orgId: 'billing', sub: 'user-1', role: 'user' } };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'PARTNER_CONTEXT_REQUIRED' });
  });

  it('requirePartnerContext returns PARTNER_BILLING_MISMATCH when billing org does not match', async () => {
    vi.mocked(prisma.institutionalPartner.findUnique).mockResolvedValue({
      id: 'p1',
      billingOrgId: 'other-billing',
    } as any);
    const mw = requirePartnerContext();
    const req: any = {
      auth: {
        orgId: 'billing',
        sub: 'user-1',
        partnerId: 'p1',
        partnerRole: 'PARTNER_ADMIN',
        role: 'user',
      },
    };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await mw(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ error: 'PARTNER_BILLING_MISMATCH' });
  });

  it('requirePartnerContext returns PARTNER_USER_NOT_AUTHORIZED when user is not linked', async () => {
    vi.mocked(prisma.institutionalPartner.findUnique).mockResolvedValue({
      id: 'p1',
      billingOrgId: 'billing',
    } as any);
    vi.mocked(prisma.partnerUser.findUnique).mockResolvedValue(null);
    const mw = requirePartnerContext();
    const req: any = {
      auth: {
        orgId: 'billing',
        sub: 'user-1',
        partnerId: 'p1',
        partnerRole: 'PARTNER_VIEWER',
        role: 'user',
      },
    };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await mw(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ error: 'PARTNER_USER_NOT_AUTHORIZED' });
  });

  it('requirePartnerContext attaches partner when billing and PartnerUser match JWT', async () => {
    vi.mocked(prisma.institutionalPartner.findUnique).mockResolvedValue({
      id: 'p1',
      billingOrgId: 'billing',
    } as any);
    vi.mocked(prisma.partnerUser.findUnique).mockResolvedValue({
      partnerId: 'p1',
      userId: 'user-1',
      role: 'PARTNER_VIEWER',
    } as any);
    const mw = requirePartnerContext();
    const req: any = {
      auth: {
        orgId: 'billing',
        sub: 'user-1',
        partnerId: 'p1',
        partnerRole: 'PARTNER_VIEWER',
        role: 'user',
      },
    };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    await mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.partner).toEqual({ partnerId: 'p1', userId: 'user-1', role: 'PARTNER_VIEWER' });
  });

  it('requirePartnerAdmin rejects PARTNER_VIEWER', () => {
    const mw = requirePartnerAdmin();
    const req: any = { partner: { partnerId: 'p1', userId: 'u', role: 'PARTNER_VIEWER' } };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'PARTNER_FORBIDDEN' });
  });
});
