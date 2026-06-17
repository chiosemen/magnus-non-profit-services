export type FeatureKey =
  | 'donor_crm'
  | 'campaigns'
  | 'stripe_connect_campaigns'
  | 'fund_accounting_lite'
  | 'ai_concierge'
  | 'board_packets'
  | 'compliance_reminders'
  | 'mcp_tools'
  | 'compliance_calendar'
  | 'grant_generator'
  | 'claude_partner'
  | 'worker_financial_layer'
  | 'agents_layer'
  /** Assisted Autonomous Ops — internal compliance + board-prep agents (maps to roadmap Tier 2). */
  | 'autonomous_ops_assisted'
  /** Full internal agent set including grant + financial watch (maps to roadmap Tier 3). */
  | 'autonomous_ops_standard'
  /** Institutional / reflection / portfolio intelligence packaging (maps to roadmap Tier 4; reserved). */
  | 'autonomous_ops_institutional';
