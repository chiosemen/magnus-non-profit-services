import type { FeatureKey } from './features';

export const ORG_DASHBOARD_ROUTE_FEATURES = {
  campaignAdmin: 'autonomous_ops_standard',
  fundAccounting: 'autonomous_ops_standard',
  conciergeAi: 'autonomous_ops_standard',
  grants: 'grant_generator',
  boardAndExecutivePackets: 'autonomous_ops_assisted',
  stripeConnectAdmin: 'autonomous_ops_standard',
} as const satisfies Record<string, FeatureKey>;

export const CLAUDE_PARTNER_ROUTE_FEATURE = 'claude_partner' as const satisfies FeatureKey;

export const MCP_TOOL_FEATURES = {
  'get-multi-org-profile': 'compliance_calendar',
  'get-filing-history': 'compliance_calendar',
  'get-state-registrations': 'compliance_calendar',
  'get-grant-history': 'grant_generator',
  'get-funder-research': 'grant_generator',
  'get-revenue-breakdown': 'worker_financial_layer',
  'get-expense-allocation': 'worker_financial_layer',
  'get-income-summary': 'worker_financial_layer',
  'get-tax-estimates': 'worker_financial_layer',
  'get-donor-summary': 'autonomous_ops_standard',
  'list-donations': 'autonomous_ops_standard',
  'get-receipt-status': 'autonomous_ops_standard',
  'get-campaign-performance': 'autonomous_ops_standard',
  'get-fund-balances': 'autonomous_ops_standard',
  'get-income-expense-summary': 'autonomous_ops_standard',
  'draft-board-packet': 'autonomous_ops_assisted',
  'list-volunteer-hours': 'autonomous_ops_standard',
  'list-concierge-proposals': 'autonomous_ops_standard',
} as const satisfies Record<string, FeatureKey>;

export function featureForMcpTool(toolName: string): FeatureKey | null {
  return MCP_TOOL_FEATURES[toolName as keyof typeof MCP_TOOL_FEATURES] ?? null;
}
