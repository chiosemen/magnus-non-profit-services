import { prisma } from '@magnus/db/client';
import type { AuthPayload, PartnerJwtRole } from './types';

export type PartnerJwtClaims = { partnerId: string; partnerRole: PartnerJwtRole };

/**
 * When the session org is the partner billing org and the user has a PartnerUser row, attach claims for org-dashboard-api.
 */
export async function loadPartnerJwtClaims(userId: string, orgId: string): Promise<PartnerJwtClaims | null> {
  const row = await prisma.partnerUser.findFirst({
    where: {
      userId,
      partner: { billingOrgId: orgId },
    },
    select: { partnerId: true, role: true },
  });
  if (!row) return null;
  if (row.role !== 'PARTNER_ADMIN' && row.role !== 'PARTNER_VIEWER') return null;
  return { partnerId: row.partnerId, partnerRole: row.role };
}

export async function buildWebAuthPayload(userId: string, orgId: string): Promise<AuthPayload> {
  const partner = await loadPartnerJwtClaims(userId, orgId);
  return partner
    ? { userId, orgId, role: 'user', partnerId: partner.partnerId, partnerRole: partner.partnerRole }
    : { userId, orgId, role: 'user' };
}
