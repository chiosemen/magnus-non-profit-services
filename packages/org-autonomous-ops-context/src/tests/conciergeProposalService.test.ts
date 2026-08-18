/**
 * Magnus S4NP — AI Concierge Proposal Service Integration & Validation Tests
 */

// Load .env from project root dynamically
if (typeof require !== 'undefined') {
  try {
    const path = require('path');
    require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });
  } catch (e) {}
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient, ConciergeProposalStatus, ConciergeProposalType, AgentScopeType, AgentRunStatus } from '@magnus/db/types';
import {
  createProposal,
  listProposals,
  updateProposalStatus,
  applyProposal,
} from '../conciergeProposalService';
import { assertSafeTestDatabaseUrl, registerDbUnavailable } from './dbTestGuard';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres@localhost/magnus';
// SPEC-P0 R3: refuse to touch anything that could be a real database.
assertSafeTestDatabaseUrl(DATABASE_URL);

async function canConnectToDb(): Promise<boolean> {
  const testClient = new PrismaClient({
    datasources: { db: { url: DATABASE_URL } },
  });
  try {
    await testClient.$queryRaw`SELECT 1`;
    await testClient.$disconnect();
    return true;
  } catch {
    await testClient.$disconnect().catch(() => {});
    return false;
  }
}

(async () => {
  const dbAvailable = await canConnectToDb();

  if (!dbAvailable) {
    registerDbUnavailable('S4NP Phase 4 Service tests', 'DATABASE_URL unreachable');
    return;
  }

  const prisma = new PrismaClient({
    datasources: { db: { url: DATABASE_URL } },
  });

  const setupTestOrg = async (ein: string, name: string) => {
    return await prisma.organization.upsert({
      where: { ein },
      update: {},
      create: {
        name,
        ein,
        subscriptionTier: 'ENTERPRISE',
      },
    });
  };

  test('ConciergeProposal Service: validation checks on create', async () => {
    const org = await setupTestOrg('00-8511111', 'Concierge Service Org 1');

    // 1. Validation: invalid confidence
    await assert.rejects(
      () => createProposal(prisma, org.id, {
        type: ConciergeProposalType.CAMPAIGN_DRAFT,
        confidence: 1.5, // invalid
        payload: { text: 'Hello' }
      }),
      (err: any) => {
        assert.ok(err.message.includes('Confidence score'));
        return true;
      }
    );

    // 2. Validation: invalid payload format
    await assert.rejects(
      () => createProposal(prisma, org.id, {
        type: ConciergeProposalType.CAMPAIGN_DRAFT,
        confidence: 0.9,
        payload: 'not-an-object' as any
      }),
      (err: any) => {
        assert.ok(err.message.includes('payload'));
        return true;
      }
    );

    // 3. Validation: missing orgId
    await assert.rejects(
      () => createProposal(prisma, '', {
        type: ConciergeProposalType.CAMPAIGN_DRAFT,
        confidence: 0.8,
        payload: { data: 123 }
      }),
      (err: any) => {
        assert.ok(err.message.includes('Organization'));
        return true;
      }
    );
  });

  test('ConciergeProposal Service: status lifecycle transitions', async () => {
    const org = await setupTestOrg('00-8622222', 'Concierge Service Org 2');

    const proposal = await createProposal(prisma, org.id, {
      type: ConciergeProposalType.COMPLIANCE_REMINDER,
      confidence: 0.95,
      payload: { reminder: 'File 990 form' },
    });

    assert.equal(proposal.status, ConciergeProposalStatus.PENDING_REVIEW);

    // 1. Transition: cannot apply immediately (must be APPROVED)
    await assert.rejects(
      () => applyProposal(prisma, org.id, proposal.id, async () => 'ok', 'ExecutorUser'),
      (err: any) => {
        assert.ok(err.message.includes('APPROVED'));
        return true;
      }
    );

    // 2. Transition: cannot directly update status to APPLIED
    await assert.rejects(
      () => updateProposalStatus(prisma, org.id, proposal.id, ConciergeProposalStatus.APPLIED, 'Reviewer'),
      (err: any) => {
        assert.ok(err.message.includes('directly marked APPLIED'));
        return true;
      }
    );

    // 3. Approve proposal
    const approved = await updateProposalStatus(prisma, org.id, proposal.id, ConciergeProposalStatus.APPROVED, 'AdminUser');
    assert.equal(approved.status, ConciergeProposalStatus.APPROVED);
    assert.equal(approved.reviewedByUser, 'AdminUser');

    // 4. Apply proposal successfully
    const executionResult = await applyProposal(prisma, org.id, proposal.id, async (payload) => {
      assert.equal(payload.reminder, 'File 990 form');
      return { success: true, dbRecordId: 'MOCK_REMINDER_123' };
    }, 'SystemExecutor');

    assert.equal(executionResult.proposal.status, ConciergeProposalStatus.APPLIED);
    assert.equal(executionResult.proposal.appliedBy, 'SystemExecutor');
    assert.deepEqual(executionResult.result, { success: true, dbRecordId: 'MOCK_REMINDER_123' });

    // 5. Try to modify an APPLIED proposal - must be rejected
    await assert.rejects(
      () => updateProposalStatus(prisma, org.id, proposal.id, ConciergeProposalStatus.REJECTED, 'LateReviewer'),
      (err: any) => {
        assert.ok(err.message.includes('already been applied'));
        return true;
      }
    );
  });

  test('ConciergeProposal Service: tenant isolation boundaries', async () => {
    const orgA = await setupTestOrg('00-8733333', 'Concierge Service Org A');
    const orgB = await setupTestOrg('00-8844444', 'Concierge Service Org B');

    const proposalA = await createProposal(prisma, orgA.id, {
      type: ConciergeProposalType.LEGACY_IMPORT_MAP,
      confidence: 0.85,
      payload: { csvHeaders: ['name', 'amount'] },
    });

    // 1. Isolation: Org B cannot list Org A's proposals
    const listB = await listProposals(prisma, orgB.id);
    assert.ok(!listB.some(p => p.id === proposalA.id));

    // 2. Isolation: Org B cannot approve Org A's proposals
    await assert.rejects(
      () => updateProposalStatus(prisma, orgB.id, proposalA.id, ConciergeProposalStatus.APPROVED, 'OrgBUser'),
      (err: any) => {
        assert.ok(err instanceof Error);
        return true;
      }
    );

    // 3. Isolation: Org B cannot apply Org A's proposals
    await assert.rejects(
      () => applyProposal(prisma, orgB.id, proposalA.id, async () => {}, 'OrgBExecutor'),
      (err: any) => {
        assert.ok(err instanceof Error);
        return true;
      }
    );
  });
})();
