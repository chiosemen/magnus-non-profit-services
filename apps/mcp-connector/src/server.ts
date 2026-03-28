import { validateEnv } from '@magnus/config';
validateEnv('mcp-connector');

import express, { Request, Response, NextFunction } from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { z } from 'zod';
import { createLogger, getLogger, requestContextMiddleware } from '@magnus/logging';
import { getTokenValidator, TokenPayload } from './auth/TokenValidator';
import { getSessionManager } from './auth/SessionManager';
import { getTool, getAllTools, hasTool } from './tools/registry';
import auditMiddleware from './audit/AuditMiddleware';
import { isMagnusError, SessionExpiredError } from './utils/errors';
import {
  enforceFeature,
  FeatureNotEnabledError,
  SubscriptionNotActiveError,
} from '@magnus/subscription';
import { validateOrgOwnership, validateWorkerAccess } from './security/validateOrgOwnership';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      auth?: TokenPayload;
    }
  }
}

const app: Express = express();
const logger = createLogger({ service: 'mcp-connector' });

app.disable('x-powered-by');
app.use(requestContextMiddleware(logger));
app.use(helmet());
app.use(cors({ origin: false }));
app.use(express.json());

// ─── Health Check (public) ───────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ ok: true }));

// ─── Auth Middleware ─────────────────────────────────────────────────────────

async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Authorization header required' });
    return;
  }

  try {
    const validator = getTokenValidator();
    const payload = validator.validate(authHeader);
    const sessionManager = getSessionManager();
    try {
      const session = await sessionManager.validateSession(payload.sessionId);
      if (session.userId !== payload.sub || session.orgId !== payload.orgId) {
        await sessionManager.invalidateSession(session.id);
        res.status(401).json({
          error: 'SESSION_MISMATCH',
          message: 'Session data does not match token claims',
        });
        return;
      }
    } catch (sessionErr) {
      if (sessionErr instanceof SessionExpiredError) {
        res.status(sessionErr.statusCode).json({ error: sessionErr.code, message: sessionErr.message });
        return;
      }
      res.status(401).json({ error: 'SESSION_INVALID', message: 'Session validation failed' });
      return;
    }
    req.auth = payload;
    next();
  } catch (err) {
    if (isMagnusError(err)) {
      res.status(err.statusCode).json({ error: err.code, message: err.message });
      return;
    }
    res.status(401).json({ error: 'AUTH_INVALID', message: 'Invalid token' });
  }
}

// ─── Tool Execution Request Schema ───────────────────────────────────────────

const ToolExecuteSchema = z.object({
  input: z.record(z.unknown()).default({}),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /api/tools - List available tools (authenticated)
app.get('/api/tools', authMiddleware, (_req: Request, res: Response) => {
  const tools = getAllTools().map(t => ({
    name: t.name,
    category: t.category,
    description: t.description,
  }));
  res.json({ tools });
});

// POST /api/tools/:toolName - Execute a tool (authenticated)
app.post('/api/tools/:toolName', authMiddleware, auditMiddleware, async (req: Request, res: Response) => {
  const toolName = req.params['toolName']!;
  const auth = req.auth!;

  // Check if tool exists
  if (!hasTool(toolName)) {
    res.status(404).json({
      error: 'MCP_TOOL_NOT_FOUND',
      message: `Tool not found: ${toolName}`,
    });
    return;
  }

  const tool = getTool(toolName)!;

  // Check permission (tool name or category or wildcard)
  const hasPermission =
    auth.permissions.includes('*') ||
    auth.permissions.includes(`tool:${toolName}`) ||
    auth.permissions.includes(`tool:${tool.category}:*`) ||
    auth.roles.includes('admin');

  if (!hasPermission) {
    res.status(403).json({
      error: 'PERMISSION_DENIED',
      message: `Permission denied for tool: ${toolName}`,
    });
    return;
  }

  // Check subscription feature entitlement
  try {
    await enforceFeature(auth.orgId, 'agents_layer');
  } catch (err) {
    if (err instanceof FeatureNotEnabledError) {
      res.status(403).json({
        error: 'FEATURE_NOT_ENABLED',
        feature: 'agents_layer',
        message: 'MCP tools require agents_layer subscription feature',
      });
      return;
    }
    if (err instanceof SubscriptionNotActiveError) {
      res.status(403).json({
        error: 'SUBSCRIPTION_NOT_ACTIVE',
        message: 'Organization subscription is not active',
      });
      return;
    }
    throw err;
  }

  // Validate request body
  const parseResult = ToolExecuteSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Invalid request body',
      details: parseResult.error.flatten().fieldErrors,
    });
    return;
  }

  const { input } = parseResult.data;

  try {
    // Validate input against tool schema
    const validatedInput = tool.schema.parse(input);

    // SECURITY: Validate org ownership for tools accepting EIN
    if ('ein' in validatedInput && typeof validatedInput.ein === 'string') {
      await validateOrgOwnership(validatedInput.ein, auth.orgId);
    }

    // SECURITY: Validate org ownership for tools accepting EINs array
    if ('eins' in validatedInput && Array.isArray(validatedInput.eins)) {
      for (const ein of validatedInput.eins) {
        if (typeof ein === 'string') {
          await validateOrgOwnership(ein, auth.orgId);
        }
      }
    }

    // SECURITY: Validate worker access for tools accepting workerId
    if ('workerId' in validatedInput && typeof validatedInput.workerId === 'string') {
      await validateWorkerAccess(validatedInput.workerId, auth.orgId);
    }

    // Execute tool
    const result = await tool.execute(validatedInput);

    res.json({
      tool: toolName,
      result: JSON.parse(result),
      executedBy: auth.sub,
      executedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid tool input',
        details: err.flatten().fieldErrors,
      });
      return;
    }
    if (isMagnusError(err)) {
      res.status(err.statusCode).json({
        error: err.code,
        message: err.message,
      });
      return;
    }
    getLogger(logger).error(
      {
        err,
        event: 'mcp_tool_execution_failed',
        toolName,
        orgId: auth.orgId,
        userId: auth.sub,
      },
      'Tool execution failed'
    );
    res.status(500).json({
      error: 'TOOL_EXECUTION_ERROR',
      message: 'Tool execution failed',
    });
  }
});

// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

// ─── Start Server ────────────────────────────────────────────────────────────

const port = parseInt(process.env['PORT'] ?? '3001', 10);

export { app };

if (require.main === module) {
  app.listen(port, () => {
    logger.info(
      { event: 'mcp_connector_server_started', port, toolsRegistered: getAllTools().length },
      'MCP connector server started'
    );
  });
}
