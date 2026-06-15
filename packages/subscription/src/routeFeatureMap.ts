import type { FeatureKey } from './features';

export const ORG_DASHBOARD_ROUTE_FEATURES = {
  donorCrm: 'donor_crm',
  campaignAdmin: 'campaigns',
  fundAccounting: 'fund_accounting_lite',
  complianceReminders: 'compliance_reminders',
  conciergeAi: 'ai_concierge',
  grants: 'grant_generator',
  boardAndExecutivePackets: 'board_packets',
  stripeConnectAdmin: 'stripe_connect_campaigns',
} as const satisfies Record<string, FeatureKey>;

export const CLAUDE_PARTNER_ROUTE_FEATURE = 'claude_partner' as const satisfies FeatureKey;

export const MCP_TOOL_FEATURES = {
  'get-multi-org-profile': 'mcp_tools',
  'get-filing-history': 'mcp_tools',
  'get-state-registrations': 'mcp_tools',
  'get-grant-history': 'mcp_tools',
  'get-funder-research': 'mcp_tools',
  'get-revenue-breakdown': 'mcp_tools',
  'get-expense-allocation': 'mcp_tools',
  'get-income-summary': 'mcp_tools',
  'get-tax-estimates': 'mcp_tools',
  'get-donor-summary': 'mcp_tools',
  'list-donations': 'mcp_tools',
  'get-receipt-status': 'mcp_tools',
  'get-campaign-performance': 'mcp_tools',
  'get-fund-balances': 'mcp_tools',
  'get-income-expense-summary': 'mcp_tools',
  'draft-board-packet': 'mcp_tools',
  'list-volunteer-hours': 'mcp_tools',
  'list-concierge-proposals': 'mcp_tools',
} as const satisfies Record<string, FeatureKey>;

export function featureForMcpTool(toolName: string): FeatureKey | null {
  return MCP_TOOL_FEATURES[toolName as keyof typeof MCP_TOOL_FEATURES] ?? null;
}
