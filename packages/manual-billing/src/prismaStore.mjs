/**
 * Prisma adapter for manual billing activation.
 * Uses Serializable isolation; FK RESTRICT on audit orgId is enforced by schema.
 */
import { Prisma } from '@magnus/db/types';

/**
 * @param {import('@magnus/db/types').PrismaClient} prisma
 */
export function createPrismaStore(prisma) {
  return {
    /**
     * @param {(tx: any) => Promise<any>} fn
     */
    transaction(fn) {
      return prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    },

    async findOrg(tx, orgId) {
      return tx.organization.findUnique({
        where: { id: orgId },
        select: {
          id: true,
          name: true,
          subscriptionTier: true,
          subscriptionStatus: true,
        },
      });
    },

    async findOrgByEin(tx, ein) {
      return tx.organization.findUnique({
        where: { ein },
        select: { id: true, name: true, ein: true },
      });
    },

    async findAuditByDealId(tx, dealId) {
      return tx.billingAuditEntry.findUnique({
        where: { dealId },
        select: { dealId: true, action: true, orgId: true, entryHash: true },
      });
    },

    async latestEntryHash(tx) {
      const latest = await tx.billingAuditEntry.findFirst({
        orderBy: { seq: 'desc' },
        select: { entryHash: true },
      });
      return latest?.entryHash ?? null;
    },

    async insertAudit(tx, row) {
      return tx.billingAuditEntry.create({
        data: {
          dealId: row.dealId,
          orgId: row.orgId,
          action: row.action,
          tier: row.tier,
          amountMinor: row.amountMinor,
          currency: row.currency,
          paymentMethod: row.paymentMethod,
          paymentReference: row.paymentReference,
          operator: row.operator,
          orgName: row.orgName,
          prevHash: row.prevHash,
          entryHash: row.entryHash,
          sealed: row.sealed,
          createdAt: row.createdAt,
        },
      });
    },

    async updateOrgEntitlement(tx, orgId, data) {
      await tx.organization.update({
        where: { id: orgId },
        data: {
          subscriptionTier: data.subscriptionTier,
          subscriptionStatus: data.subscriptionStatus,
        },
        select: { id: true },
      });
    },

    async createOrganization(tx, params) {
      return tx.organization.create({
        data: {
          name: params.name,
          ein: params.ein,
          subscriptionTier: params.subscriptionTier,
          // Explicit PENDING — never inherit entitlement from a default alone in operator path.
          subscriptionStatus: 'PENDING',
        },
        select: {
          id: true,
          name: true,
          ein: true,
          subscriptionTier: true,
          subscriptionStatus: true,
        },
      });
    },
  };
}
