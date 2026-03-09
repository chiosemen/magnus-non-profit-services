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
  | 'mcp-connector'
  | 'web';

const nonEmpty = z.string().trim().min(1);
const numeric = z.string().regex(/^\d+$/);

const baseServiceSchema = z.object({
  DATABASE_URL: nonEmpty,
  JWT_SECRET: nonEmpty.min(32),
  ENCRYPTION_KEY: nonEmpty.regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),
});

const billingSchema = baseServiceSchema.extend({
  STRIPE_SECRET_KEY: nonEmpty,
});

const claudePartnerSchema = baseServiceSchema.extend({
  ANTHROPIC_API_KEY: nonEmpty,
});

const agentsSchema = z.object({
  DATABASE_URL: nonEmpty,
  ENCRYPTION_KEY: nonEmpty.regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),
});

const grantGeneratorSchema = z.object({
  DATABASE_URL: nonEmpty,
  ENCRYPTION_KEY: nonEmpty.regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),
  ANTHROPIC_API_KEY: nonEmpty,
  // Optional knobs used by the grant-generator ClaudeClient.
  ANTHROPIC_MODEL: nonEmpty.optional(),
  ANTHROPIC_MAX_TOKENS: numeric.optional(),
  MAX_RETRIES: numeric.optional(),
  RETRY_DELAY_MS: numeric.optional(),
});

const mcpConnectorSchema = baseServiceSchema; // DATABASE_URL + JWT_SECRET ≥ 32

const webSchema = baseServiceSchema.extend({
  NODE_ENV: nonEmpty,
});

type EnvByService = {
  'agents': z.infer<typeof agentsSchema>;
  'billing': z.infer<typeof billingSchema>;
  'claude-partner': z.infer<typeof claudePartnerSchema>;
  'grant-generator': z.infer<typeof grantGeneratorSchema>;
  'mcp-connector': z.infer<typeof mcpConnectorSchema>;
  'org-dashboard-api': z.infer<typeof baseServiceSchema>;
  'worker-financial-layer': z.infer<typeof baseServiceSchema>;
  'web': z.infer<typeof webSchema>;
};

export function getEnv<S extends EnvServiceName>(service: S): EnvByService[S] {
  const schemas: Record<EnvServiceName, z.ZodTypeAny> = {
    'agents': agentsSchema,
    'billing': billingSchema,
    'claude-partner': claudePartnerSchema,
    'grant-generator': grantGeneratorSchema,
    'mcp-connector': mcpConnectorSchema,
    'org-dashboard-api': baseServiceSchema,
    'worker-financial-layer': baseServiceSchema,
    'web': webSchema,
  };

  const schema = schemas[service];
  const parsed = schema.safeParse(process.env);
  if (parsed.success) return parsed.data as EnvByService[S];

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
    'org-dashboard-api': baseServiceSchema,
    'worker-financial-layer': baseServiceSchema,
    'web': webSchema,
  };

  const schema = schemas[service];
  const parsed = schema.safeParse(process.env);
  if (parsed.success) return;

  const keys = new Set<string>();
  for (const issue of parsed.error.issues) {
    if (issue.path.length > 0 && typeof issue.path[0] === 'string') keys.add(issue.path[0]);
  }

  const missingOrInvalid = Array.from(keys).sort();
  const suffix = missingOrInvalid.length > 0 ? `: ${missingOrInvalid.join(', ')}` : '';
  throw new Error(`Invalid environment configuration for ${service}${suffix}`);
}
