export type AgentsEnv = {
  DATABASE_URL: string;
  NODE_ENV: string;
  AGENTS_TIMEZONE?: string;
  AGENTS_ALERT_SINK: 'db' | 'console';
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

  return {
    DATABASE_URL: required('DATABASE_URL'),
    NODE_ENV: nodeEnv,
    AGENTS_TIMEZONE: process.env['AGENTS_TIMEZONE'],
    AGENTS_ALERT_SINK: sink,
  };
}

