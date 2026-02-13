export type BillingEnv = {
  NODE_ENV: string;
  PORT: number;
  DATABASE_URL: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
};

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function loadEnv(): BillingEnv {
  const port = parseInt(process.env['PORT'] ?? '4040', 10);
  if (!Number.isFinite(port) || port <= 0) throw new Error('Invalid PORT');
  return {
    NODE_ENV: process.env['NODE_ENV'] ?? 'development',
    PORT: port,
    DATABASE_URL: required('DATABASE_URL'),
    STRIPE_SECRET_KEY: required('STRIPE_SECRET_KEY'),
    STRIPE_WEBHOOK_SECRET: required('STRIPE_WEBHOOK_SECRET'),
  };
}

