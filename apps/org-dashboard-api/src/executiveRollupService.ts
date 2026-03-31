import prisma from '@magnus/db/client';
import type { FeatureKey } from '@magnus/subscription';
import { isFeatureEnabled } from '@magnus/subscription';
import { getOrgAuditPrepSnapshot } from './orgAuditPrepService';
import { getOrg990Readiness } from './org990ReadinessService';
import { getOrgGovernanceSnapshot } from './orgGovernanceService';
import { getOrgStateRegistrationSnapshot } from './orgStateRegistrationService';
import { getOrgComplianceCalendar, getOrgGrants } from './orgReadService';
import { listRestrictedFunds } from './restrictedFundsService';
import { getDonorOperationsSummary } from './donorOperationsService';
import { getVolunteerOperationsSummary } from './volunteerOperationsService';

export type SectionCoverage = 'ok' | 'weak' | 'unavailable';

export type ExecutiveSection = {
  coverage: SectionCoverage;
  source: string;
  dashboardHref: string;
  summary: Record<string, unknown>;
  unavailableReason?: string;
};

function can(
  tier: 'STARTER' | 'GROWTH' | 'ENTERPRISE',
  status: 'ACTIVE' | 'PAST_DUE' | 'CANCELED',
  key: FeatureKey
): boolean {
  return isFeatureEnabled({ tier, status, featureKey: key });
}

export async function getExecutiveRollup(orgId: string, now: Date = new Date()) {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { subscriptionTier: true, subscriptionStatus: true },
  });
  if (!org) return null;

  const tier = org.subscriptionTier;
  const status = org.subscriptionStatus;

  const sections: Record<string, ExecutiveSection> = {};

  const addUnavailable = (key: string, source: string, href: string, feature: FeatureKey) => {
    sections[key] = {
      coverage: 'unavailable',
      source,
      dashboardHref: href,
      summary: {},
      unavailableReason: `Feature ${feature} is not enabled for this subscription.`,
    };
  };

  if (can(tier, status, 'compliance_calendar')) {
    const items = await getOrgComplianceCalendar(orgId);
    sections.compliance = {
      coverage: items.length > 0 ? 'ok' : 'weak',
      source: 'compliance_calendar',
      dashboardHref: '/dashboard/compliance',
      summary: { upcomingDeadlines: items.length },
    };
  } else {
    addUnavailable('compliance', 'compliance_calendar', '/dashboard/compliance', 'compliance_calendar');
  }

  if (can(tier, status, 'grant_generator')) {
    const grants = await getOrgGrants(orgId);
    sections.grants = {
      coverage: grants.length > 0 ? 'ok' : 'weak',
      source: 'org_grants',
      dashboardHref: '/dashboard/grants',
      summary: { grantRecordCount: grants.length },
    };
  } else {
    addUnavailable('grants', 'org_grants', '/dashboard/grants', 'grant_generator');
  }

  if (can(tier, status, 'restricted_funds')) {
    const funds = await listRestrictedFunds(orgId);
    sections.restrictedFunds = {
      coverage: funds.length > 0 ? 'ok' : 'weak',
      source: 'restricted_funds',
      dashboardHref: '/dashboard/restricted-funds',
      summary: { fundCount: funds.length },
    };
  } else {
    addUnavailable('restrictedFunds', 'restricted_funds', '/dashboard/restricted-funds', 'restricted_funds');
  }

  if (can(tier, status, 'compliance_calendar')) {
    const snap = await getOrgGovernanceSnapshot(orgId, now);
    const board = snap.boardMembers?.length ?? 0;
    sections.governance = {
      coverage: board > 0 ? 'ok' : 'weak',
      source: 'governance',
      dashboardHref: '/dashboard/governance',
      summary: { boardMemberCount: board },
    };

    const audit = await getOrgAuditPrepSnapshot(orgId, now);
    const blocked = audit.items.filter(i => i.status === 'BLOCKED').length;
    sections.auditPrep = {
      coverage: blocked > 0 ? 'weak' : audit.items.length > 0 ? 'ok' : 'weak',
      source: 'audit_prep',
      dashboardHref: '/dashboard/audit-prep',
      summary: { itemCount: audit.items.length, blockedCount: blocked },
    };

    const reg = await getOrgStateRegistrationSnapshot(orgId);
    const regRows = reg.registrations?.length ?? 0;
    sections.stateRegistrations = {
      coverage: regRows > 0 ? 'ok' : 'weak',
      source: 'state_registrations',
      dashboardHref: '/dashboard/state-registrations',
      summary: { registrationCount: regRows },
    };

    const readiness = await getOrg990Readiness(orgId);
    if (!readiness) {
      sections.form990Readiness = {
        coverage: 'unavailable',
        source: '990_readiness',
        dashboardHref: '/dashboard/990-readiness',
        summary: {},
        unavailableReason: 'Organization not found.',
      };
    } else if (readiness.status === 'insufficient_data') {
      sections.form990Readiness = {
        coverage: 'weak',
        source: '990_readiness',
        dashboardHref: '/dashboard/990-readiness',
        summary: { status: 'insufficient_data' },
      };
    } else {
      sections.form990Readiness = {
        coverage: 'ok',
        source: '990_readiness',
        dashboardHref: '/dashboard/990-readiness',
        summary: { overallScore: readiness.overallScore, taxYear: readiness.taxYear },
      };
    }
  } else {
    addUnavailable('governance', 'governance', '/dashboard/governance', 'compliance_calendar');
    addUnavailable('auditPrep', 'audit_prep', '/dashboard/audit-prep', 'compliance_calendar');
    addUnavailable('stateRegistrations', 'state_registrations', '/dashboard/state-registrations', 'compliance_calendar');
    addUnavailable('form990Readiness', '990_readiness', '/dashboard/990-readiness', 'compliance_calendar');
  }

  if (can(tier, status, 'donor_operations')) {
    const donor = await getDonorOperationsSummary(orgId, now);
    const donorExecCoverage: SectionCoverage =
      donor.donorDataStatus === 'OK' ? 'ok' : donor.donorDataStatus === 'NOT_CONFIGURED' ? 'unavailable' : 'weak';
    sections.donorOperations = {
      coverage: donorExecCoverage,
      source: 'donor_operations',
      dashboardHref: '/dashboard/donor-operations',
      summary: {
        donorDataStatus: donor.donorDataStatus,
        giftCount: donor.giftCount,
        portfolio: donor.portfolio,
        lapsedCount: donor.lapsedDonors.length,
      },
    };
  } else {
    addUnavailable('donorOperations', 'donor_operations', '/dashboard/donor-operations', 'donor_operations');
  }

  if (can(tier, status, 'volunteer_operations')) {
    const vol = await getVolunteerOperationsSummary(orgId, now);
    sections.volunteerOperations = {
      coverage: vol.totals.timeEntryCount > 0 ? 'ok' : 'weak',
      source: 'volunteer_operations',
      dashboardHref: '/dashboard/volunteer-operations',
      summary: {
        totalHours: vol.totals.totalHours,
        activeVolunteers: vol.totals.activeVolunteerProfiles,
        inKindAvailable: vol.assumptions.inKindAvailable,
      },
    };
  } else {
    addUnavailable(
      'volunteerOperations',
      'volunteer_operations',
      '/dashboard/volunteer-operations',
      'volunteer_operations'
    );
  }

  return {
    orgId,
    generatedAt: now.toISOString(),
    disclaimer:
      'Read-only rollups with source links and coverage states. No cross-module health score; no AI-generated strategy.',
    sections,
  };
}
