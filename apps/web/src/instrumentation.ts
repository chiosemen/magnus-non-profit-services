import { validateWebEnv } from './lib/env';

export async function register(): Promise<void> {
  if (process.env['NEXT_RUNTIME'] === 'nodejs') {
    validateWebEnv();
  }
}
export async function onRequestError(err: Error, request: any, context: any) {
  if (process.env.SENTRY_DSN) {
     // Observability seed: format payload to OTEL specification format matching our backend agent pattern
     console.error(JSON.stringify({
       level: 'fatal',
       type: 'sentry_emulation_event_web',
       message: err instanceof Error ? err.message : String(err),
       stack: err instanceof Error ? err.stack : undefined,
       url: request?.url,
       method: request?.method,
       route: context?.route,
     }));
  } else {
     // Non SENTRY_DSN fallback
     console.error('[Web Error]', err);
  }
}
