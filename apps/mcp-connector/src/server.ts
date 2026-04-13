import { validateEnv } from '@magnus/config';
validateEnv('mcp-connector');

import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { getTokenValidator } from './auth/TokenValidator';
import auditMiddleware from './audit/AuditMiddleware';

// Import tools
import getMultiOrgProfile from './tools/workers/get-multi-org-profile';
import getRevenueBreakdown from './tools/financials/get-revenue-breakdown';
import getExpenseAllocation from './tools/financials/get-expense-allocation';
import getGrantHistory from './tools/grants/get-grant-history';
import getFunderResearch from './tools/grants/get-funder-research';
import getFilingHistory from './tools/compliance/get-filing-history';
import getStateRegistrations from './tools/compliance/get-state-registrations';
import getIncomeSummary from './tools/workers/get-income-summary';
import getTaxEstimates from './tools/workers/get-tax-estimates';

const tools = [
  getMultiOrgProfile,
  getRevenueBreakdown,
  getExpenseAllocation,
  getGrantHistory,
  getFunderResearch,
  getFilingHistory,
  getStateRegistrations,
  getIncomeSummary,
  getTaxEstimates,
];

const toolMap = new Map(tools.map(t => [t.name, t]));

const app: express.Application = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: false })); // API-first; proxy should set CORS in production.
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

// Auth Middleware
function authMiddleware(req: Request, res: Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }
  try {
    const payload = getTokenValidator().validate(authHeader);
    (req as any).userId = payload.sub;
    (req as any).orgId = payload.orgId;
    next();
  } catch (err) {
    res.status(401).json({ error: err instanceof Error ? err.message : 'UNAUTHORIZED' });
  }
}

// Global Audit Middleware
app.use('/tools', authMiddleware, auditMiddleware);

app.post('/tools/execute', async (req: Request, res: Response) => {
  const { toolName, params } = req.body;
  if (!toolName || typeof toolName !== 'string') {
    res.status(400).json({ error: 'Tool name required' });
    return;
  }

  const tool = toolMap.get(toolName);
  if (!tool) {
    res.status(404).json({ error: `Tool ${toolName} not found` });
    return;
  }

  try {
    const context = {
      userId: (req as any).userId,
      orgId: (req as any).orgId,
    };
    // Cast tool to any to bypass strict parameter count type checking
    const result = await (tool as any).execute(params, context);
    // Tools return stringified json.
    res.type('json').send(result);
  } catch (err: any) {
    console.error(`[Tool Execution] Error executing tool ${toolName}:`, err);
    res.status(500).json({ error: err.message || 'Internal Tool Error' });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND' });
});

const port = parseInt(process.env['PORT'] ?? '3001', 10);

// Only listen if not running in a test suite, to avoid open handles
if (require.main === module) {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`mcp-connector listening on ${port}`);
  });
}

export default app;
