/**
 * Magnus Accord — Observability Module
 *
 * Provides consistent error reporting and telemetry across all services.
 * When SENTRY_DSN is set, errors are formatted for Sentry/OTEL ingestion.
 * When not set, errors are logged to console with structured format.
 *
 * PRODUCTION CONTRACT:
 * - Never log secrets, tokens, or PII in error payloads
 * - Always include service name and timestamp
 * - Use structured JSON format for log aggregation
 */

export type ErrorSeverity = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface ErrorContext {
  service: string;
  operation?: string;
  userId?: string;
  orgId?: string;
  requestId?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  [key: string]: unknown;
}

export interface TelemetryEvent {
  level: ErrorSeverity;
  type: string;
  service: string;
  message: string;
  timestamp: string;
  stack?: string;
  context?: Record<string, unknown>;
}

// Redact sensitive fields from context
const SENSITIVE_KEYS = [
  'password', 'secret', 'token', 'key', 'auth', 'credential',
  'ssn', 'plaidAccessToken', 'apiKey', 'jwt', 'bearer'
];

function redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some(s => lowerKey.includes(s))) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = redactSensitive(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function formatEvent(
  level: ErrorSeverity,
  service: string,
  message: string,
  error?: Error,
  context?: ErrorContext
): TelemetryEvent {
  const event: TelemetryEvent = {
    level,
    type: `magnus_${service}_${level}`,
    service,
    message,
    timestamp: new Date().toISOString(),
  };

  if (error?.stack) {
    event.stack = error.stack;
  }

  if (context) {
    const { service: _, ...rest } = context;
    event.context = redactSensitive(rest);
  }

  return event;
}

/**
 * Report an error to the observability backend.
 * Uses SENTRY_DSN if set, otherwise logs to console.
 */
export function reportError(
  service: string,
  error: Error | string,
  context?: ErrorContext,
  level: ErrorSeverity = 'error'
): void {
  const err = typeof error === 'string' ? new Error(error) : error;
  const event = formatEvent(level, service, err.message, err, context);

  if (process.env.SENTRY_DSN) {
    // Structured JSON for Sentry/OTEL ingestion
    console.error(JSON.stringify(event));
  } else if (process.env.NODE_ENV === 'production') {
    // Production without Sentry: still use structured format
    console.error(JSON.stringify(event));
  } else {
    // Development: human-readable format
    console.error(`[${service}] ${level.toUpperCase()}: ${err.message}`);
    if (err.stack) console.error(err.stack);
  }
}

/**
 * Report a fatal error and optionally exit the process.
 */
export function reportFatal(
  service: string,
  error: Error | string,
  context?: ErrorContext,
  exitCode?: number
): void {
  reportError(service, error, context, 'fatal');
  if (typeof exitCode === 'number') {
    process.exit(exitCode);
  }
}

/**
 * Create an unhandled rejection handler for a service.
 */
export function createUnhandledRejectionHandler(service: string): (reason: unknown) => void {
  return (reason: unknown) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    reportError(service, err, { service, operation: 'unhandledRejection' }, 'fatal');
  };
}

/**
 * Create an uncaught exception handler for a service.
 */
export function createUncaughtExceptionHandler(service: string): (error: Error) => void {
  return (error: Error) => {
    reportFatal(service, error, { service, operation: 'uncaughtException' }, 1);
  };
}

/**
 * Initialize observability for a service.
 * Sets up global error handlers.
 */
export function initObservability(service: string): void {
  process.on('unhandledRejection', createUnhandledRejectionHandler(service));
  process.on('uncaughtException', createUncaughtExceptionHandler(service));

  if (process.env.SENTRY_DSN) {
    console.log(`[${service}] Observability: SENTRY_DSN configured`);
  } else if (process.env.NODE_ENV === 'production') {
    console.warn(`[${service}] Observability: SENTRY_DSN not set in production`);
  }
}

/**
 * Report a request error (for HTTP services).
 */
export function reportRequestError(
  service: string,
  error: Error,
  request: { url?: string; method?: string },
  context?: Partial<ErrorContext>
): void {
  reportError(service, error, {
    service,
    route: request.url,
    method: request.method,
    ...context,
  });
}
