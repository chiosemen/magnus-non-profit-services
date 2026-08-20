/**
 * In-memory store for conformance tests — mirrors Prisma store contract.
 */
import { randomUUID } from 'node:crypto';

export function createMemoryStore(seedOrgs = []) {
  /** @type {Map<string, any>} */
  const orgs = new Map(seedOrgs.map((o) => [o.id, { ...o }]));
  /** @type {any[]} */
  const audits = [];
  let failNextAudit = false;

  return {
    failNextAuditOnce() {
      failNextAudit = true;
    },
    getAudits() {
      return audits.slice();
    },
    getOrg(id) {
      return orgs.get(id) || null;
    },

    async transaction(fn) {
      // Shallow transactional semantics: clone, commit on success, discard on throw.
      const orgSnap = new Map([...orgs.entries()].map(([k, v]) => [k, { ...v }]));
      const auditSnap = audits.map((a) => ({ ...a }));
      const tx = { __mem: true };
      try {
        const result = await fn(tx);
        // commit already mutated through closures — ok for tests
        return result;
      } catch (e) {
        orgs.clear();
        for (const [k, v] of orgSnap) orgs.set(k, v);
        audits.length = 0;
        for (const a of auditSnap) audits.push(a);
        throw e;
      }
    },

    async findOrg(_tx, orgId) {
      return orgs.get(orgId) || null;
    },

    async findOrgByEin(_tx, ein) {
      for (const o of orgs.values()) {
        if (o.ein === ein) return o;
      }
      return null;
    },

    async findAuditByDealId(_tx, dealId) {
      return audits.find((a) => a.dealId === dealId) || null;
    },

    async latestEntryHash(_tx) {
      if (audits.length === 0) return null;
      return audits[audits.length - 1].entryHash;
    },

    async insertAudit(_tx, row) {
      if (failNextAudit) {
        failNextAudit = false;
        throw new Error('AUDIT_WRITE_FAILED');
      }
      if (audits.some((a) => a.dealId === row.dealId)) {
        throw new Error('DEAL_ID_UNIQUE_VIOLATION');
      }
      const saved = { ...row, seq: audits.length + 1, id: randomUUID() };
      audits.push(saved);
      return saved;
    },

    async updateOrgEntitlement(_tx, orgId, data) {
      const org = orgs.get(orgId);
      if (!org) throw new Error('ORG_NOT_FOUND');
      org.subscriptionTier = data.subscriptionTier;
      org.subscriptionStatus = data.subscriptionStatus;
    },

    async createOrganization(_tx, params) {
      const org = {
        id: randomUUID(),
        name: params.name,
        ein: params.ein,
        subscriptionTier: params.subscriptionTier,
        subscriptionStatus: 'PENDING',
      };
      orgs.set(org.id, org);
      return org;
    },
  };
}
