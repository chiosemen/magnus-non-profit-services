import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import pino, { type Bindings, type Logger } from 'pino';

type RequestContext = {
  requestId: string;
  logger: Logger;
};

const requestContext = new AsyncLocalStorage<RequestContext>();

const baseLogger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      logger?: Logger;
    }
  }
}

export function createLogger(bindings: Bindings = {}): Logger {
  return Object.keys(bindings).length > 0 ? baseLogger.child(bindings) : baseLogger;
}

export function requestContextMiddleware(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = extractRequestId(req.headers['x-request-id']) ?? randomUUID();
    const requestLogger = logger.child({ requestId });

    req.requestId = requestId;
    req.logger = requestLogger;
    res.setHeader('x-request-id', requestId);

    requestContext.run({ requestId, logger: requestLogger }, () => {
      next();
    });
  };
}

export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

export function getLogger(fallback: Logger = baseLogger): Logger {
  return requestContext.getStore()?.logger ?? fallback;
}

function extractRequestId(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0]?.trim() || undefined;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}