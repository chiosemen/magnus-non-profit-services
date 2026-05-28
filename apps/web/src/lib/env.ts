import { requireEnvForService, validateEnvForService } from '@magnus/config';

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

export function getWebEnv(): WebEnv {
  // Uses canonical zod schema validation which will hard-fail on missing fields
  const env = requireEnvForService('web');

  return {
    DATABASE_URL: env.DATABASE_URL!,
    JWT_SECRET: env.JWT_SECRET!,
    ORG_DASHBOARD_API_BASE_URL: env.ORG_DASHBOARD_API_BASE_URL ?? null,
    APP_URL: env.NEXT_PUBLIC_APP_URL ?? null,
  };
}

export function validateWebEnv(): void {
  validateEnvForService('web');
}
