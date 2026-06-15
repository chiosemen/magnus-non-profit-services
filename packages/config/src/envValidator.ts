import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Deterministic env loading for all apps:
// 1) Load package-local `.env` (pnpm runs scripts with cwd at the package).
// 2) Load repo-root `.env` as a fallback for shared vars.
// Never override already-set env (CI/prod wins).
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export type EnvServiceName =
  | 'org-dashboard-api'
  | 'worker-financial-layer'
  | 'claude-partner'
  | 'billing'
  | 'agents'
  | 'grant-generator'
  | 'mcp-connector';

const nonEmpty = z.string().trim().min(1);
const numeric = z.string().regex(/^\d+$/);

const baseServiceSchema = z.object({
  DATABASE_URL: nonEmpty,
  JWT_SECRET: nonEmpty.min(32),
});

const billingSchema = baseServiceSchema.extend({
  STRIPE_SECRET_KEY: nonEmpty,
});

const orgDashboardApiSchema = baseServiceSchema.extend({
  REDIS_URL: nonEmpty.optional(),
  STRIPE_SECRET_KEY: z.preprocess((val) => {
    if (process.env.NODE_ENV === 'production') return val;
    return val || 'dev_stripe_secret_key';
  }, nonEmpty),
  STRIPE_WEBHOOK_SECRET: z.preprocess((val) => {
    if (process.env.NODE_ENV === 'production') return val;
    return val || 'dev_stripe_webhook_secret';
  }, nonEmpty),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.preprocess((val) => {
    if (process.env.NODE_ENV === 'production') return val;
    return val || 'dev_stripe_publishable_key';
  }, nonEmpty),
  NEXT_PUBLIC_APP_URL: z.preprocess((val) => {
    if (process.env.NODE_ENV === 'production') return val;
    return val || 'http://localhost:3000';
  }, nonEmpty),
  STRIPE_CONNECT_CLIENT_ID: nonEmpty.optional(),
  STRIPE_CONNECT_RETURN_URL: z.string().trim().url(),
  STRIPE_CONNECT_REFRESH_URL: z.string().trim().url(),
});

const claudePartnerSchema = baseServiceSchema.extend({
  ANTHROPIC_API_KEY: nonEmpty,
});

const agentsSchema = z.object({
  DATABASE_URL: nonEmpty,
});

const grantGeneratorSchema = z.object({
  DATABASE_URL: nonEmpty,
  ANTHROPIC_API_KEY: nonEmpty,
  // Optional knobs used by the grant-generator ClaudeClient.
  ANTHROPIC_MODEL: nonEmpty.optional(),
  ANTHROPIC_MAX_TOKENS: numeric.optional(),
  MAX_RETRIES: numeric.optional(),
  RETRY_DELAY_MS: numeric.optional(),
  JWT_SECRET: nonEmpty.min(32),
  JWT_ISSUER: nonEmpty.optional(),
  JWT_AUDIENCE: nonEmpty.optional(),
  MCP_CONNECTOR_URL: nonEmpty.optional(),
});

const mcpConnectorSchema = baseServiceSchema.extend({
  REDIS_URL: nonEmpty.optional(),
}); // REDIS_URL is production-required below.

type EnvByService = {
  'agents': z.infer<typeof agentsSchema>;
  'billing': z.infer<typeof billingSchema>;
  'claude-partner': z.infer<typeof claudePartnerSchema>;
  'grant-generator': z.infer<typeof grantGeneratorSchema>;
  'mcp-connector': z.infer<typeof mcpConnectorSchema>;
  'org-dashboard-api': z.infer<typeof orgDashboardApiSchema>;
  'worker-financial-layer': z.infer<typeof baseServiceSchema>;
};

function assertProductionRedisConfigured(service: EnvServiceName): void {
  if (
    (service === 'org-dashboard-api' || service === 'mcp-connector') &&
    process.env.NODE_ENV === 'production' &&
    !process.env.REDIS_URL?.trim()
  ) {
    throw new Error(`Invalid environment configuration for ${service}: REDIS_URL`);
  }
}

export function getEnv<S extends EnvServiceName>(service: S): EnvByService[S] {
  const schemas: Record<EnvServiceName, z.ZodTypeAny> = {
    'agents': agentsSchema,
    'billing': billingSchema,
    'claude-partner': claudePartnerSchema,
    'grant-generator': grantGeneratorSchema,
    'mcp-connector': mcpConnectorSchema,
    'org-dashboard-api': orgDashboardApiSchema,
    'worker-financial-layer': baseServiceSchema,
  };

  const schema = schemas[service];
  const parsed = schema.safeParse(process.env);
  if (parsed.success) {
    assertProductionRedisConfigured(service);
    return parsed.data as EnvByService[S];
  }

  const keys = new Set<string>();
  for (const issue of parsed.error.issues) {
    if (issue.path.length > 0 && typeof issue.path[0] === 'string') keys.add(issue.path[0]);
  }

  const missingOrInvalid = Array.from(keys).sort();
  const suffix = missingOrInvalid.length > 0 ? `: ${missingOrInvalid.join(', ')}` : '';
  throw new Error(`Invalid environment configuration for ${service}${suffix}`);
}

export function validateEnv(service: EnvServiceName): void {
  const schemas: Record<EnvServiceName, z.ZodTypeAny> = {
    'agents': agentsSchema,
    'billing': billingSchema,
    'claude-partner': claudePartnerSchema,
    'grant-generator': grantGeneratorSchema,
    'mcp-connector': mcpConnectorSchema,
    'org-dashboard-api': orgDashboardApiSchema,
    'worker-financial-layer': baseServiceSchema,
  };

  const schema = schemas[service];
  const parsed = schema.safeParse(process.env);
  if (parsed.success) {
    assertProductionRedisConfigured(service);
    return;
  }

  const keys = new Set<string>();
  for (const issue of parsed.error.issues) {
    if (issue.path.length > 0 && typeof issue.path[0] === 'string') keys.add(issue.path[0]);
  }

  const missingOrInvalid = Array.from(keys).sort();
  const suffix = missingOrInvalid.length > 0 ? `: ${missingOrInvalid.join(', ')}` : '';
  throw new Error(`Invalid environment configuration for ${service}${suffix}`);
}
