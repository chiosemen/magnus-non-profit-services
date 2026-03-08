export type AlertSinkType = 'db' | 'console' | 'slack' | 'fallback';

export type AgentsEnv = {
  DATABASE_URL: string;
  NODE_ENV: string;
  AGENTS_TIMEZONE?: string;
  AGENTS_ALERT_SINK: AlertSinkType;
  SLACK_WEBHOOK_URL?: string;
  SLACK_MAX_RETRIES?: number;
};

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function optionalInt(name: string, defaultValue: number): number {
  const v = process.env[name];
  if (!v) return defaultValue;
  const parsed = parseInt(v, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid integer for env var: ${name}`);
  }
  return parsed;
}

const VALID_SINKS: AlertSinkType[] = ['db', 'console', 'slack', 'fallback'];

export function loadEnv(): AgentsEnv {
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const sink = (process.env['AGENTS_ALERT_SINK'] ?? 'db') as AlertSinkType;

  if (!VALID_SINKS.includes(sink)) {
    throw new Error(`Invalid AGENTS_ALERT_SINK. Expected one of: ${VALID_SINKS.join(', ')}`);
  }

  // Fail closed: console not allowed in production
  if (nodeEnv === 'production' && sink === 'console') {
    throw new Error('ConsoleAlertSink is not allowed in production. Set AGENTS_ALERT_SINK=db|slack|fallback.');
  }

  // Fail closed: slack/fallback require webhook URL
  const slackWebhookUrl = process.env['SLACK_WEBHOOK_URL'];
  if ((sink === 'slack' || sink === 'fallback') && !slackWebhookUrl) {
    throw new Error('SLACK_WEBHOOK_URL is required when AGENTS_ALERT_SINK=slack or fallback.');
  }

  // Fail closed: validate Slack webhook URL format
  if (slackWebhookUrl && !slackWebhookUrl.startsWith('https://hooks.slack.com/')) {
    throw new Error('SLACK_WEBHOOK_URL must be a valid Slack webhook URL (https://hooks.slack.com/...)');
  }

  return {
    DATABASE_URL: required('DATABASE_URL'),
    NODE_ENV: nodeEnv,
    AGENTS_TIMEZONE: process.env['AGENTS_TIMEZONE'],
    AGENTS_ALERT_SINK: sink,
    SLACK_WEBHOOK_URL: slackWebhookUrl,
    SLACK_MAX_RETRIES: optionalInt('SLACK_MAX_RETRIES', 3),
  };
}

