/**
 * Pure mapping/aggregation for multi-org worker profiles (P0-4, SPEC-P0 R4).
 *
 * The Organization table tracks name, EIN, annualRevenue, and updatedAt.
 * Everything else in the legacy OrgProfile shape (city, state, NTEE code,
 * tax year, expenses, net assets, headcounts, program ratio, filing status,
 * health score) has NO data source. The previous mapper fabricated those
 * fields — 'Unknown' strings, truth-bearing zeros, taxYear = current year,
 * healthScore = 50, and a filing status the tool layer rendered as
 * "✅ Current". Under R4 every unavailable value is now null, and provenance
 * names the source plus exactly which fields are unavailable.
 *
 * Kept free of imports from @magnus/db so it can be unit-tested without a
 * database or Prisma engine (SPEC-P0 R3).
 */

export interface OrgProfileProvenance {
  /** Where the available fields came from. */
  source: string;
  /** Fields that are null because no connected data source tracks them. */
  unavailableFields: string[];
}

export interface OrgProfile {
  ein: string;
  orgName: string;
  city: string | null;
  state: string | null;
  nteeCode: string | null;
  taxYear: number | null;
  totalRevenue: number | null;
  totalExpenses: number | null;
  netAssets: number | null;
  employeeCount: number | null;
  volunteerCount: number | null;
  programRatio: number | null;
  filingStatus: 'current' | 'overdue' | 'pending' | null;
  healthScore: number | null;
  lastSynced: Date;
  provenance: OrgProfileProvenance;
}

export interface MultiOrgProfileProvenance {
  source: string;
  /** How many of the orgs contributed a real revenue figure. */
  revenueOrgsIncluded: number;
  orgCount: number;
  /** Aggregates that are null because no data source feeds them. */
  unavailableAggregates: string[];
}

export interface MultiOrgProfile {
  userId: string;
  organizations: OrgProfile[];
  totalRevenue: number | null;
  totalNetAssets: number | null;
  totalEmployees: number | null;
  combinedHealthScore: number | null;
  orgCount: number;
  alerts: Array<{ ein: string; orgName: string; severity: string; message: string }>;
  comparisonMetrics: OrgComparison[];
  lastUpdated: Date;
  provenance: MultiOrgProfileProvenance;
}

export interface OrgComparison {
  metric: string;
  values: Array<{ ein: string; orgName: string; value: number; formatted: string }>;
  bestEIN: string;
  insight: string;
}

export const ORG_PROFILE_SOURCE = 'prisma:workerOrgRelationship+organization';

/** Fields the Organization table simply does not track today. */
const UNTRACKED_ORG_FIELDS = [
  'city',
  'state',
  'nteeCode',
  'taxYear',
  'totalExpenses',
  'netAssets',
  'employeeCount',
  'volunteerCount',
  'programRatio',
  'filingStatus',
  'healthScore',
] as const;

export interface OrgRelationRecord {
  organization: {
    ein: string;
    name: string;
    annualRevenue: unknown;
    updatedAt: Date;
  };
}

export function mapOrgRelationsToProfiles(relationships: OrgRelationRecord[]): OrgProfile[] {
  return relationships.map((rel) => {
    const dbOrg = rel.organization;
    const hasRevenue = dbOrg.annualRevenue !== null && dbOrg.annualRevenue !== undefined;
    const unavailableFields: string[] = [...UNTRACKED_ORG_FIELDS];
    if (!hasRevenue) unavailableFields.push('totalRevenue');
    return {
      ein: dbOrg.ein,
      orgName: dbOrg.name,
      city: null,
      state: null,
      nteeCode: null,
      taxYear: null,
      totalRevenue: hasRevenue ? Number(dbOrg.annualRevenue) : null,
      totalExpenses: null,
      netAssets: null,
      employeeCount: null,
      volunteerCount: null,
      programRatio: null,
      filingStatus: null,
      healthScore: null,
      lastSynced: dbOrg.updatedAt,
      provenance: {
        source: ORG_PROFILE_SOURCE,
        unavailableFields,
      },
    };
  });
}

export function buildComparisonMetrics(orgs: OrgProfile[], formatCurrency: (n: number) => string): OrgComparison[] {
  // Compare only orgs whose revenue is actually known — a fabricated zero
  // would otherwise rank real organizations below each other dishonestly.
  const withRevenue = orgs.filter(
    (o): o is OrgProfile & { totalRevenue: number } => o.totalRevenue !== null
  );
  if (withRevenue.length < 2) return [];

  return [
    {
      metric: 'Total Revenue',
      values: withRevenue.map((o) => ({
        ein: o.ein,
        orgName: o.orgName,
        value: o.totalRevenue,
        formatted: formatCurrency(o.totalRevenue),
      })),
      bestEIN: withRevenue.reduce(
        (best, o) =>
          o.totalRevenue > (withRevenue.find((x) => x.ein === best)?.totalRevenue ?? 0) ? o.ein : best,
        withRevenue[0]?.ein ?? ''
      ),
      insight: `Raw revenue size across the ${withRevenue.length} of ${orgs.length} organization(s) with revenue on file`,
    },
  ];
}

export function aggregateMultiOrgProfile(params: {
  userId: string;
  orgs: OrgProfile[];
  formatCurrency: (n: number) => string;
  now?: Date;
}): MultiOrgProfile {
  const { userId, orgs, formatCurrency } = params;

  const revenues = orgs
    .map((o) => o.totalRevenue)
    .filter((r): r is number => r !== null);
  const totalRevenue = revenues.length > 0 ? revenues.reduce((s, r) => s + r, 0) : null;

  const unavailableAggregates = ['totalNetAssets', 'totalEmployees', 'combinedHealthScore'];
  if (totalRevenue === null) unavailableAggregates.unshift('totalRevenue');

  // Only a real, recorded 'overdue' status may raise an alert. A null
  // filing status is unknown — it must produce neither an alert nor an
  // implied "all clear".
  const alerts = orgs
    .filter((o) => o.filingStatus === 'overdue')
    .map((o) => ({
      ein: o.ein,
      orgName: o.orgName,
      severity: 'critical',
      message: `Form 990 filing is overdue for ${o.orgName}`,
    }));

  return {
    userId,
    organizations: orgs,
    totalRevenue,
    totalNetAssets: null,
    totalEmployees: null,
    combinedHealthScore: null,
    orgCount: orgs.length,
    alerts,
    comparisonMetrics: buildComparisonMetrics(orgs, formatCurrency),
    lastUpdated: params.now ?? new Date(),
    provenance: {
      source: ORG_PROFILE_SOURCE,
      revenueOrgsIncluded: revenues.length,
      orgCount: orgs.length,
      unavailableAggregates,
    },
  };
}
