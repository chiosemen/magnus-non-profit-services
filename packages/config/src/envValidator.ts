import { z } from 'zod';

export type EnvServiceName =
  | 'org-dashboard-api'
  | 'worker-financial-layer'
  | 'claude-partner'
  | 'billing'
  | 'agents';

const nonEmpty = z.string().trim().min(1);

const baseServiceSchema = z.object({
  DATABASE_URL: nonEmpty,
  JWT_SECRET: nonEmpty.min(32),
});

const billingSchema = baseServiceSchema.extend({
  STRIPE_SECRET_KEY: nonEmpty,
});

const claudePartnerSchema = baseServiceSchema.extend({
  ANTHROPIC_API_KEY: nonEmpty,
});

const agentsSchema = z.object({
  DATABASE_URL: nonEmpty,
});

export function validateEnv(service: EnvServiceName): void {
  const schema =
    service === 'agents'
      ? agentsSchema
      : service === 'billing'
        ? billingSchema
        : service === 'claude-partner'
          ? claudePartnerSchema
          : baseServiceSchema;

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

