export type WebEnv = {
  DATABASE_URL: string;
  JWT_SECRET: string;
  ORG_DASHBOARD_API_BASE_URL: string | null;
  /**
   * Public-facing base URL of this app (e.g. https://app.magnus.com).
   * Required in production for CSRF origin enforcement.
   * Optional in development — any localhost origin is permitted when absent.
   */
  APP_URL: string | null;
};

function required(name: 'DATABASE_URL' | 'JWT_SECRET'): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function normalizeDashboardBaseUrl(): string | null {
  const raw = process.env['ORG_DASHBOARD_API_BASE_URL']?.trim();
  if (!raw) return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Invalid ORG_DASHBOARD_API_BASE_URL. Expected an absolute http(s) URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Invalid ORG_DASHBOARD_API_BASE_URL. Expected an absolute http(s) URL.');
  }

  return parsed.toString().replace(/\/$/, '');
}

function normalizeAppUrl(): string | null {
  const raw = process.env['NEXT_PUBLIC_APP_URL']?.trim();
  if (!raw) {
    if (process.env['NODE_ENV'] === 'production') {
      // Warn but do not hard-fail here — csrf.ts will fail-closed at request time.
      console.warn('[magnus:env] NEXT_PUBLIC_APP_URL is not set. CSRF origin validation will reject ALL mutations in production.');
    }
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Invalid NEXT_PUBLIC_APP_URL. Expected an absolute http(s) URL (e.g. https://app.magnus.com).');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Invalid NEXT_PUBLIC_APP_URL. Expected an absolute http(s) URL.');
  }

  return parsed.toString().replace(/\/$/, '');
}

export function getWebEnv(): WebEnv {
  const databaseUrl = required('DATABASE_URL');
  const jwtSecret = required('JWT_SECRET');
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters');
  }

  return {
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    ORG_DASHBOARD_API_BASE_URL: normalizeDashboardBaseUrl(),
    APP_URL: normalizeAppUrl(),
  };
}

export function validateWebEnv(): void {
  getWebEnv();
}
