export type ClaudePartnerEnv = {
  NODE_ENV: string;
  PORT: number;
  DATABASE_URL: string;
  ANTHROPIC_API_KEY: string;
};

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export function loadEnv(): ClaudePartnerEnv {
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const port = parseInt(process.env['PORT'] ?? '4020', 10);
  if (!Number.isFinite(port) || port <= 0) throw new Error('Invalid PORT');

  return {
    NODE_ENV: nodeEnv,
    PORT: port,
    DATABASE_URL: required('DATABASE_URL'),
    // Hard requirement: fail closed if missing. No silent fallback.
    ANTHROPIC_API_KEY: required('ANTHROPIC_API_KEY'),
  };
}

