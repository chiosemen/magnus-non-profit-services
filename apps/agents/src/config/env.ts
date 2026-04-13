export type AgentsEnv = {
  DATABASE_URL: string;
  NODE_ENV: string;
  AGENTS_TIMEZONE?: string;
  AGENTS_ALERT_SINK: 'db' | 'console';
  // Per-agent kill switches
  AGENT_ENABLE_COMPLIANCE_WATCHDOG?: boolean;
  AGENT_ENABLE_GRANT_MANAGER?: boolean;
  AGENT_ENABLE_FINANCIAL_SENTINEL?: boolean;
  AGENT_ENABLE_BOARD_ORACLE?: boolean;
  AGENT_ENABLE_GRANT_HERALD?: boolean;
  AGENT_ENABLE_WORKER_INCOME_OPTIMIZER?: boolean;
};

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export function loadEnv(): AgentsEnv {
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const sink = (process.env['AGENTS_ALERT_SINK'] ?? 'db') as AgentsEnv['AGENTS_ALERT_SINK'];
  if (sink !== 'db' && sink !== 'console') {
    throw new Error('Invalid AGENTS_ALERT_SINK. Expected "db" or "console".');
  }
  if (nodeEnv === 'production' && sink === 'console') {
    throw new Error('ConsoleAlertSink is not allowed in production. Set AGENTS_ALERT_SINK=db.');
  }

  const toBool = (v: string | undefined): boolean | undefined => {
    if (v === undefined) return undefined;
    return v.toLowerCase() === 'true';
  };

  return {
    DATABASE_URL: required('DATABASE_URL'),
    NODE_ENV: nodeEnv,
    AGENTS_TIMEZONE: process.env['AGENTS_TIMEZONE'],
    AGENTS_ALERT_SINK: sink,
    AGENT_ENABLE_COMPLIANCE_WATCHDOG: toBool(process.env['AGENT_ENABLE_COMPLIANCE_WATCHDOG']),
    AGENT_ENABLE_GRANT_MANAGER: toBool(process.env['AGENT_ENABLE_GRANT_MANAGER']),
    AGENT_ENABLE_FINANCIAL_SENTINEL: toBool(process.env['AGENT_ENABLE_FINANCIAL_SENTINEL']),
    AGENT_ENABLE_BOARD_ORACLE: toBool(process.env['AGENT_ENABLE_BOARD_ORACLE']),
    AGENT_ENABLE_GRANT_HERALD: toBool(process.env['AGENT_ENABLE_GRANT_HERALD']),
    AGENT_ENABLE_WORKER_INCOME_OPTIMIZER: toBool(process.env['AGENT_ENABLE_WORKER_INCOME_OPTIMIZER']),
  };
}

