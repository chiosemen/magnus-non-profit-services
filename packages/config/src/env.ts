import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const nonEmpty = z.string().trim().min(1);
const urlString = nonEmpty.url();
const numericString = z.string().regex(/^\d+$/);
const boolFromString = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return value;
}, z.boolean());

const nodeEnvSchema = z.enum(['development', 'test', 'production']).default('development');
const plaidEnvSchema = z.enum(['sandbox', 'development', 'production']);

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: urlString.optional(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: nonEmpty.optional(),
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: nonEmpty.optional(),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: nonEmpty.optional(),
  NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: nonEmpty.optional(),
  NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: nonEmpty.optional(),
  NEXT_PUBLIC_SUPABASE_URL: urlString.optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: nonEmpty.optional(),
  EXPO_PUBLIC_API_BASE_URL: urlString.optional(),
});

export const serverEnvSchema = z.object({
  DATABASE_URL: nonEmpty.optional(),
  DATABASE_URL_UNPOOLED: nonEmpty.optional(),
  REDIS_URL: nonEmpty.optional(),
  JWT_SECRET: nonEmpty.min(32).optional(),
  JWT_ISSUER: nonEmpty.optional(),
  JWT_AUDIENCE: nonEmpty.optional(),
  ENCRYPTION_KEY: z.string().regex(/^[A-Fa-f0-9]{64}$/, 'ENCRYPTION_KEY must be 64 hex characters').optional(),

  CLERK_SECRET_KEY: nonEmpty.optional(),
  CLERK_WEBHOOK_SECRET: nonEmpty.optional(),

  ANTHROPIC_API_KEY: nonEmpty.optional(),
  ANTHROPIC_MODEL: nonEmpty.optional(),
  ANTHROPIC_MAX_TOKENS: numericString.optional(),
  CLAUDE_PARTNER_USAGE_CAP: numericString.optional(),

  PLAID_CLIENT_ID: nonEmpty.optional(),
  PLAID_SECRET: nonEmpty.optional(),
  PLAID_ENV: plaidEnvSchema.optional(),
  PLAID_WEBHOOK_URL: urlString.optional(),
  PLAID_BASE_URL: urlString.optional(),
  PLAID_MCP_URL: urlString.optional(),

  PROPUBLICA_API_KEY: nonEmpty.optional(),
  PROPUBLICA_BASE_URL: urlString.optional(),
  CANDID_API_KEY: nonEmpty.optional(),
  CANDID_BASE_URL: urlString.optional(),
  CANDID_MCP_URL: urlString.optional(),
  GUIDESTAR_API_KEY: nonEmpty.optional(),

  MCP_SERVER_URL: urlString.optional(),
  MCP_SERVER_SECRET: nonEmpty.optional(),
  MCP_RATE_LIMIT_WINDOW_MS: numericString.optional(),
  MCP_RATE_LIMIT_MAX: numericString.optional(),
  MCP_CONNECTOR_URL: urlString.optional(),

  SMTP_HOST: nonEmpty.optional(),
  SMTP_PORT: numericString.optional(),
  SMTP_USER: nonEmpty.optional(),
  SMTP_PASS: nonEmpty.optional(),
  FROM_EMAIL: z.string().email().optional(),
  SENDGRID_API_KEY: nonEmpty.optional(),
  RESEND_API_KEY: nonEmpty.optional(),

  SUPABASE_SERVICE_ROLE_KEY: nonEmpty.optional(),
  AWS_ACCESS_KEY_ID: nonEmpty.optional(),
  AWS_SECRET_ACCESS_KEY: nonEmpty.optional(),
  AWS_S3_BUCKET: nonEmpty.optional(),
  AWS_BUCKET: nonEmpty.optional(),
  AWS_REGION: nonEmpty.optional(),

  SENTRY_DSN: nonEmpty.optional(),
  SENTRY_AUTH_TOKEN: nonEmpty.optional(),
  POSTHOG_API_KEY: nonEmpty.optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: urlString.optional(),
  OTEL_SERVICE_NAME: nonEmpty.optional(),
  LOGTAIL_TOKEN: nonEmpty.optional(),

  STRIPE_SECRET_KEY: nonEmpty.optional(),
  STRIPE_WEBHOOK_SECRET: nonEmpty.optional(),
  STRIPE_PRICE_ID_STARTER: nonEmpty.optional(),
  STRIPE_PRICE_ID_GROWTH: nonEmpty.optional(),
  STRIPE_PRICE_ID_ENTERPRISE: nonEmpty.optional(),

  API_URL: urlString.optional(),
  ORG_DASHBOARD_API_BASE_URL: urlString.optional(),
  NODE_ENV: nodeEnvSchema,
  PORT: numericString.optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),

  FEATURE_FLAG_MCP_LIVE: boolFromString.optional(),
  FEATURE_FLAG_MOBILE: boolFromString.optional(),
  FEATURE_FLAG_PLAID: boolFromString.optional(),
  FEATURE_FLAG_WORKER_FINANCIALS: boolFromString.optional(),
  FEATURE_FLAG_MOBILE_AUTH: boolFromString.optional(),
  FEATURE_FLAG_CLAUDE_MESSAGES: boolFromString.optional(),

  AGENTS_ENABLED: boolFromString.optional(),
  AGENT_ENABLE_COMPLIANCE_WATCHDOG: boolFromString.optional(),
  AGENT_ENABLE_WORKER_INCOME_OPTIMIZER: boolFromString.optional(),
  AGENT_ENABLE_GRANT_MANAGER: boolFromString.optional(),
  AGENT_ENABLE_GRANT_HERALD: boolFromString.optional(),
  AGENT_ENABLE_BOARD_ORACLE: boolFromString.optional(),
  AGENT_ENABLE_FINANCIAL_SENTINEL: boolFromString.optional(),
  ORACLE_ALLOW_EXTERNAL_SEND: boolFromString.optional(),
  AGENTS_ALERT_SINK: z.enum(['db', 'console']).optional(),
  AGENTS_TIMEZONE: nonEmpty.optional(),
  AGENT_HEARTBEAT_ENABLED: boolFromString.optional(),
  AGENT_MAX_ORG_CONCURRENCY: numericString.optional(),

  OUTPUT_DIR: nonEmpty.optional(),
  MAX_RETRIES: numericString.optional(),
  RETRY_DELAY_MS: numericString.optional(),
  SECTION_TIMEOUT_MS: numericString.optional(),
});

export const allEnvSchema = serverEnvSchema.merge(publicEnvSchema);

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type AppEnv = z.infer<typeof allEnvSchema>;

export type EnvServiceName =
  | 'web'
  | 'org-dashboard-api'
  | 'worker-financial-layer'
  | 'claude-partner'
  | 'billing'
  | 'agents'
  | 'grant-generator'
  | 'mcp-connector'
  | 'mobile';

const serviceSchemas: Record<EnvServiceName, z.ZodTypeAny> = {
  'web': allEnvSchema.pick({
    DATABASE_URL: true,
    JWT_SECRET: true,
    NODE_ENV: true,
    ORG_DASHBOARD_API_BASE_URL: true,
    NEXT_PUBLIC_APP_URL: true,
  }),
  'org-dashboard-api': allEnvSchema.pick({
    DATABASE_URL: true,
    JWT_SECRET: true,
    NODE_ENV: true,
    PORT: true,
  }),
  'worker-financial-layer': allEnvSchema.pick({
    DATABASE_URL: true,
    JWT_SECRET: true,
    NODE_ENV: true,
    PORT: true,
  }),
  'claude-partner': allEnvSchema.pick({
    DATABASE_URL: true,
    JWT_SECRET: true,
    NODE_ENV: true,
    PORT: true,
    ANTHROPIC_API_KEY: true,
    MCP_CONNECTOR_URL: true,
  }),
  'billing': allEnvSchema.pick({
    DATABASE_URL: true,
    JWT_SECRET: true,
    NODE_ENV: true,
    PORT: true,
    STRIPE_SECRET_KEY: true,
    STRIPE_WEBHOOK_SECRET: true,
  }),
  'agents': allEnvSchema.pick({
    DATABASE_URL: true,
    NODE_ENV: true,
    AGENTS_ENABLED: true,
    AGENT_ENABLE_COMPLIANCE_WATCHDOG: true,
    AGENT_ENABLE_WORKER_INCOME_OPTIMIZER: true,
    AGENT_ENABLE_GRANT_MANAGER: true,
    AGENT_ENABLE_GRANT_HERALD: true,
    AGENT_ENABLE_BOARD_ORACLE: true,
    AGENT_ENABLE_FINANCIAL_SENTINEL: true,
    ORACLE_ALLOW_EXTERNAL_SEND: true,
    AGENTS_ALERT_SINK: true,
    AGENTS_TIMEZONE: true,
    AGENT_MAX_ORG_CONCURRENCY: true,
  }),
  'grant-generator': allEnvSchema.pick({
    DATABASE_URL: true,
    NODE_ENV: true,
    PORT: true,
    ANTHROPIC_API_KEY: true,
    ANTHROPIC_MODEL: true,
    ANTHROPIC_MAX_TOKENS: true,
    CANDID_API_KEY: true,
    CANDID_MCP_URL: true,
    PLAID_CLIENT_ID: true,
    PLAID_SECRET: true,
    PLAID_MCP_URL: true,
    OUTPUT_DIR: true,
    MAX_RETRIES: true,
    RETRY_DELAY_MS: true,
    JWT_SECRET: true,
    JWT_ISSUER: true,
    JWT_AUDIENCE: true,
  }),
  'mcp-connector': allEnvSchema.pick({
    DATABASE_URL: true,
    JWT_SECRET: true,
    NODE_ENV: true,
    PORT: true,
    REDIS_URL: true,
    PROPUBLICA_API_KEY: true,
    PROPUBLICA_BASE_URL: true,
    CANDID_API_KEY: true,
    CANDID_BASE_URL: true,
    PLAID_CLIENT_ID: true,
    PLAID_SECRET: true,
    PLAID_BASE_URL: true,
    JWT_ISSUER: true,
    JWT_AUDIENCE: true,
  }),
  'mobile': allEnvSchema.pick({
    EXPO_PUBLIC_API_BASE_URL: true,
  }),
};

function formatEnvError(service: EnvServiceName, error: z.ZodError): string {
  const keys = Array.from(
    new Set(
      error.issues
        .map((issue) => (typeof issue.path[0] === 'string' ? issue.path[0] : null))
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort();

  const details = keys.length > 0 ? `: ${keys.join(', ')}` : '';
  return `Invalid environment configuration for ${service}${details}`;
}

export function loadPublicEnv(input: NodeJS.ProcessEnv = process.env): PublicEnv {
  const parsed = publicEnvSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid public environment configuration: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  }
  return parsed.data;
}

export function loadEnv(input: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = allEnvSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  }
  return parsed.data;
}

export function requireEnvForService<S extends EnvServiceName>(
  service: S,
  input: NodeJS.ProcessEnv = process.env,
): z.infer<(typeof serviceSchemas)[S]> {
  const schema = serviceSchemas[service];
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new Error(formatEnvError(service, parsed.error));
  }
  return parsed.data as z.infer<(typeof serviceSchemas)[S]>;
}

export function validateEnvForService(service: EnvServiceName, input: NodeJS.ProcessEnv = process.env): void {
  requireEnvForService(service, input);
}
