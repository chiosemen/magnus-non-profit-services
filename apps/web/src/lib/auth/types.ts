/** Matches org-dashboard-api partner JWT claims when the user is a PartnerUser for the billing org. */
export type PartnerJwtRole = 'PARTNER_ADMIN' | 'PARTNER_VIEWER';

export interface AuthPayload {
  userId: string;
  orgId: string;
  role: string;
  partnerId?: string;
  partnerRole?: PartnerJwtRole;
}

