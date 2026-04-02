/**
 * Canonical connector capability registry for Magnus Accord.
 * Maturity and actions must not exceed repo truth (see docs/product/MAGNUS_ACCORD_CONNECTOR_REGISTRY.md).
 */

export type ConnectorMaturity = 'LIVE' | 'LIMITED' | 'PILOT' | 'INTERNAL_ONLY' | 'NOT_IMPLEMENTED';

/** Action verbs the product uses to describe connector capability (not an exhaustive IAM model). */
export type ConnectorActionKind =
  | 'read'
  | 'draft'
  | 'notify'
  | 'write'
  | 'submit'
  | 'internal_alert'
  | 'internal_persist';

export type ConnectorActionDef = {
  kind: ConnectorActionKind;
  /** If true, human approval is required before this action may be taken on behalf of the org (Tier B/C style). */
  requiresApproval: boolean;
  /** Short clarification when ambiguous. */
  note?: string;
};

export type AccordConnectorKey =
  | 'magnusHq'
  | 'claudePartner'
  | 'mcpConnector'
  | 'grantGenerator'
  | 'workerFinancialLayer'
  | 'plaidFinancialWatch'
  | 'candidGrantIntelligence'
  | 'stripeDonorLinkage'
  | 'slackOutboundAlerts';

export type AccordConnectorRegistryEntry = {
  key: AccordConnectorKey;
  displayName: string;
  maturity: ConnectorMaturity;
  actions: ConnectorActionDef[];
  /** Shown on Autonomous Ops Connectors (or related) UI when true. */
  clientVisible: boolean;
  /** Product is explicitly pilot-scoped for this row (e.g. web API returns PILOT_ONLY). */
  pilotOnly: boolean;
  setupPrerequisites: string[];
  disclaimer: string;
};

/** Keys rendered on the web Connectors page (order preserved). */
export const CLIENT_CONNECTOR_PANEL_KEYS = [
  'claudePartner',
  'mcpConnector',
  'grantGenerator',
  'workerFinancialLayer',
] as const;

export type ClientConnectorPanelKey = (typeof CLIENT_CONNECTOR_PANEL_KEYS)[number];

export const ACCORD_CONNECTOR_REGISTRY: Record<AccordConnectorKey, AccordConnectorRegistryEntry> = {
  magnusHq: {
    key: 'magnusHq',
    displayName: 'Magnus HQ (database and org APIs)',
    maturity: 'LIVE',
    actions: [
      { kind: 'read', requiresApproval: false, note: 'Authenticated reads via org-dashboard-api and web proxies.' },
      { kind: 'write', requiresApproval: false, note: 'Internal persistence (alerts, memory, handoffs, settings) at Tier A.' },
      { kind: 'internal_persist', requiresApproval: false, note: 'Agent and staff writes constrained by platform autonomy rules.' },
    ],
    clientVisible: false,
    pilotOnly: false,
    setupPrerequisites: ['Postgres with migrations applied', 'org-dashboard-api and web deployed with valid environment validation'],
    disclaimer:
      'Not a third-party SaaS connector; this is the authoritative data plane for the tenant when correctly deployed.',
  },

  claudePartner: {
    key: 'claudePartner',
    displayName: 'Claude Partner API',
    maturity: 'LIMITED',
    actions: [
      { kind: 'read', requiresApproval: false, note: 'Model inference for org-scoped use when integration is ACTIVE.' },
      { kind: 'draft', requiresApproval: false, note: 'Drafts stay internal unless a separate human-controlled channel sends them.' },
      { kind: 'submit', requiresApproval: true, note: 'Any external send or filing is not performed autonomously by agents today.' },
    ],
    clientVisible: true,
    pilotOnly: false,
    setupPrerequisites: [
      'claude-partner service deployed and configured',
      'Organization claudeStatus progressed per database (e.g. CONFIGURING → ACTIVE)',
    ],
    disclaimer:
      'Status shown from the organization record only; enabling the integration is deployment- and operations-dependent.',
  },

  mcpConnector: {
    key: 'mcpConnector',
    displayName: 'MCP Connector',
    maturity: 'PILOT',
    actions: [
      { kind: 'read', requiresApproval: false, note: 'Tool reads may hit demo or stub paths; not dashboard truth.' },
      { kind: 'draft', requiresApproval: false, note: 'Assistive outputs are not authoritative financial or compliance records.' },
      { kind: 'write', requiresApproval: true, note: 'External or authoritative writes are out of scope for autonomous agents (Tier A only).' },
    ],
    clientVisible: true,
    pilotOnly: true,
    setupPrerequisites: ['Custom deployment of apps/mcp-connector', 'Org policy on what MCP output may be used for'],
    disclaimer:
      'Known non-truth surfaces: compliance, financial, and worker services include mock, random, or in-memory behavior per docs/PRODUCTION_TRUTH_CHECKLIST.md §4. Do not market as production financial or compliance authority.',
  },

  grantGenerator: {
    key: 'grantGenerator',
    displayName: 'Grant Generator',
    maturity: 'PILOT',
    actions: [
      { kind: 'draft', requiresApproval: false, note: 'Assistive drafting only.' },
      { kind: 'submit', requiresApproval: true, note: 'No autonomous grant submission by Magnus Accord agents.' },
    ],
    clientVisible: true,
    pilotOnly: true,
    setupPrerequisites: ['apps/grant-generator deployed', 'Environment validation and secrets for that service'],
    disclaimer:
      'Web product shows pilot-only until org-scoped connector state is stored and aligned with dashboard truth.',
  },

  workerFinancialLayer: {
    key: 'workerFinancialLayer',
    displayName: 'Worker Financial Layer',
    maturity: 'PILOT',
    actions: [
      { kind: 'read', requiresApproval: false, note: 'Intended for worker-scoped views when deployed.' },
      { kind: 'draft', requiresApproval: false, note: 'Estimates and assists are not authoritative payroll or tax filings.' },
      { kind: 'write', requiresApproval: true, note: 'No autonomous mutation of authoritative external records.' },
    ],
    clientVisible: true,
    pilotOnly: true,
    setupPrerequisites: ['apps/worker-financial-layer deployed', 'Tier and routing as defined for that app'],
    disclaimer:
      'Pilot-only in web connector API; MCP worker paths may use in-memory registry—see production checklist §4.',
  },

  plaidFinancialWatch: {
    key: 'plaidFinancialWatch',
    displayName: 'Plaid (financial watch for FinancialSentinel)',
    maturity: 'INTERNAL_ONLY',
    actions: [
      { kind: 'read', requiresApproval: false, note: 'Agents read balances/transactions to emit internal alerts only.' },
      { kind: 'internal_alert', requiresApproval: false, note: 'Alerts persist to DB; no autonomous money movement.' },
    ],
    clientVisible: false,
    pilotOnly: false,
    setupPrerequisites: [
      'ENTERPRISE subscription and FinancialSentinel scheduled',
      'PLAID_CLIENT_ID / PLAID_SECRET and org Plaid access token configuration as implemented in agents',
    ],
    disclaimer:
      'Not exposed as a self-serve connector card in the web app; misconfiguration yields CASH_RUNWAY_UNAVAILABLE-style outcomes.',
  },

  candidGrantIntelligence: {
    key: 'candidGrantIntelligence',
    displayName: 'Candid (grant opportunities for GrantIntelligenceHerald)',
    maturity: 'INTERNAL_ONLY',
    actions: [
      { kind: 'read', requiresApproval: false, note: 'Opportunity fetch for matching when API key and inputs exist.' },
      { kind: 'draft', requiresApproval: false, note: 'Internal HERALD packets and alerts; no autonomous submission.' },
      { kind: 'internal_alert', requiresApproval: false, note: 'Deduped alerts in database.' },
    ],
    clientVisible: false,
    pilotOnly: false,
    setupPrerequisites: [
      'ENTERPRISE subscription and GrantIntelligenceHerald scheduled',
      'Candid API key and org identity inputs as required by opportunityClient',
    ],
    disclaimer:
      'Unavailable or seed paths are handled fail-closed in agent code; not a self-serve connector row in the web UI.',
  },

  stripeDonorLinkage: {
    key: 'stripeDonorLinkage',
    displayName: 'Stripe (org donor linkage)',
    maturity: 'LIMITED',
    actions: [
      { kind: 'read', requiresApproval: false, note: 'Org Stripe Connect id used for donor-ops module state and DonorEvent context.' },
      { kind: 'write', requiresApproval: true, note: 'Ledger writes via controlled APIs; no autonomous payout actions from agents.' },
    ],
    clientVisible: false,
    pilotOnly: false,
    setupPrerequisites: ['Stripe account ids on Organization as implemented in Prisma', 'DonorEvent ingestion path (API), not a full web ledger UI in pilot'],
    disclaimer: 'Supports donor-ops signals; does not replace a full CRM or finance system of record.',
  },

  slackOutboundAlerts: {
    key: 'slackOutboundAlerts',
    displayName: 'Slack (outbound agent alerts)',
    maturity: 'NOT_IMPLEMENTED',
    actions: [],
    clientVisible: false,
    pilotOnly: false,
    setupPrerequisites: [],
    disclaimer:
      'Canonical apps/agents alert sinks are database and console only; Slack webhook sink is not present in this tree (do not market).',
  },
};

export type ConnectorClientPanelRow = {
  key: AccordConnectorKey;
  displayName: string;
  maturity: ConnectorMaturity;
  actions: ConnectorActionDef[];
  /** Runtime status string from API/DB (e.g. ClaudeStatus or PILOT_ONLY). */
  runtimeStatus: string;
  clientVisible: boolean;
  pilotOnly: boolean;
  setupPrerequisites: string[];
  disclaimer: string;
};

/**
 * Build rows for the four Autonomous Ops connector cards with registry metadata + runtime status.
 */
export function buildClientConnectorPanels(params: {
  claudePartnerStatus: string;
}): ConnectorClientPanelRow[] {
  const staticPilot = 'PILOT_ONLY';
  const statuses: Record<ClientConnectorPanelKey, string> = {
    claudePartner: params.claudePartnerStatus,
    mcpConnector: staticPilot,
    grantGenerator: staticPilot,
    workerFinancialLayer: staticPilot,
  };

  return CLIENT_CONNECTOR_PANEL_KEYS.map(key => {
    const e = ACCORD_CONNECTOR_REGISTRY[key];
    return {
      key: e.key,
      displayName: e.displayName,
      maturity: e.maturity,
      actions: e.actions,
      runtimeStatus: statuses[key],
      clientVisible: e.clientVisible,
      pilotOnly: e.pilotOnly,
      setupPrerequisites: e.setupPrerequisites,
      disclaimer: e.disclaimer,
    };
  });
}

export function listAllRegistryKeys(): AccordConnectorKey[] {
  return Object.keys(ACCORD_CONNECTOR_REGISTRY) as AccordConnectorKey[];
}
