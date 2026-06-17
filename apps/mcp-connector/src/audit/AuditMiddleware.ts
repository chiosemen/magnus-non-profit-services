/**
 * Magnus MCP Connector — AuditMiddleware
 * Express middleware: auto-logs every tool call through AuditLogger
 */

import { Request, Response, NextFunction } from 'express';
import { AuditLogger } from './AuditLogger';

const logger = new AuditLogger();

type RequestWithAuth = Request & {
  userId?: string;
  orgId?: string;
};

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const toolName = req.body?.toolName ?? req.body?.method ?? req.path.split('/').pop() ?? 'unknown';
  const userId = (req as RequestWithAuth).userId ?? 'anonymous';
  const orgId = (req as RequestWithAuth).orgId ?? 'unknown';
  const requestId = getRequestId(req);

  // Audit records intentionally keep tool inputs metadata-only.
  logger.logToolCall({
    toolName,
    userId,
    orgId,
    metadata: buildSafeToolCallMetadata(req, { toolName, userId, orgId, requestId }),
    timestamp: new Date(),
    requestId,
  }).catch(console.error);

  // Intercept response to log result
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  let logged = false;

  res.json = function (body: unknown) {
    if (!logged) {
      logged = true;
      const duration = Date.now() - startTime;
      logger.logToolResult({
        toolName,
        userId,
        orgId,
        success: res.statusCode < 400,
        statusCode: res.statusCode,
        durationMs: duration,
        timestamp: new Date(),
        requestId,
        resultSummary: res.statusCode < 400 ? 'Success' : String((body as Record<string, unknown>)?.error ?? 'Error'),
      }).catch(console.error);
    }
    return originalJson(body);
  };

  res.send = function (body: unknown) {
    if (!logged) {
      logged = true;
      const duration = Date.now() - startTime;
      logger.logToolResult({
        toolName,
        userId,
        orgId,
        success: res.statusCode < 400,
        statusCode: res.statusCode,
        durationMs: duration,
        timestamp: new Date(),
        requestId,
        resultSummary: res.statusCode < 400 ? 'Success' : 'Error',
      }).catch(console.error);
    }
    return originalSend(body);
  };

  next();
}

function getRequestId(req: Request): string {
  const header = req.headers['x-request-id'] ?? req.headers['x-correlation-id'];
  if (Array.isArray(header)) return header[0] ?? `req_${Date.now()}`;
  if (typeof header === 'string' && header.trim()) return header;
  return `req_${Date.now()}`;
}

function buildSafeToolCallMetadata(
  req: Request,
  params: { toolName: string; userId: string; orgId: string; requestId: string },
) {
  const rawParams = req.body?.params;
  const parameterCount = countParameters(rawParams);
  return {
    toolName: params.toolName,
    userId: params.userId,
    orgId: params.orgId,
    requestId: params.requestId,
    route: req.path,
    method: req.method,
    hasParameters: parameterCount > 0,
    parameterCount,
  };
}

function countParameters(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object') return Object.keys(value).length;
  return 1;
}

export default auditMiddleware;
