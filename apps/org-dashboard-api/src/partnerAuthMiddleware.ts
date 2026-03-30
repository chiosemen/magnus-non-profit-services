import type { NextFunction, Request, Response } from 'express';
import prisma from '@magnus/db/client';
import type { PartnerUserRole } from '@magnus/db/types';

export type PartnerRequestContext = {
  partnerId: string;
  userId: string;
  role: PartnerUserRole;
};

/**
 * After jwtAuth + requireFeature('institutional_partner').
 * Requires JWT billing orgId to match InstitutionalPartner.billingOrgId and a PartnerUser row.
 * Rejects tampered partnerRole claims that do not match the database.
 */
export function requirePartnerContext() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = (req as Request & { auth?: { orgId: string; sub?: string; partnerId?: string; partnerRole?: string } }).auth;
      if (!auth?.partnerId || !auth.sub) {
        res.status(403).json({ error: 'PARTNER_CONTEXT_REQUIRED' });
        return;
      }
      if (auth.partnerRole !== 'PARTNER_ADMIN' && auth.partnerRole !== 'PARTNER_VIEWER') {
        res.status(403).json({ error: 'PARTNER_ROLE_INVALID' });
        return;
      }

      const partner = await prisma.institutionalPartner.findUnique({
        where: { id: auth.partnerId },
        select: { id: true, billingOrgId: true },
      });
      if (!partner || partner.billingOrgId !== auth.orgId) {
        res.status(403).json({ error: 'PARTNER_BILLING_MISMATCH' });
        return;
      }

      const partnerUser = await prisma.partnerUser.findUnique({
        where: {
          partnerId_userId: { partnerId: auth.partnerId, userId: auth.sub },
        },
      });
      if (!partnerUser) {
        res.status(403).json({ error: 'PARTNER_USER_NOT_AUTHORIZED' });
        return;
      }
      if (partnerUser.role !== auth.partnerRole) {
        res.status(403).json({ error: 'PARTNER_ROLE_MISMATCH' });
        return;
      }

      (req as Request & { partner: PartnerRequestContext }).partner = {
        partnerId: partnerUser.partnerId,
        userId: partnerUser.userId,
        role: partnerUser.role,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requirePartnerAdmin() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const partner = (req as Request & { partner?: PartnerRequestContext }).partner;
    if (!partner || partner.role !== 'PARTNER_ADMIN') {
      res.status(403).json({ error: 'PARTNER_FORBIDDEN' });
      return;
    }
    next();
  };
}
