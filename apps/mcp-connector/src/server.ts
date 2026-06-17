import { validateEnv } from '@magnus/config';
validateEnv('mcp-connector');

import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { getTokenValidator } from './auth/TokenValidator';
import auditMiddleware from './audit/AuditMiddleware';
import { mcpToolSubscriptionGate } from './subscriptionGate';
import { getMcpRateLimiter, initializeMcpRateLimiter, isRateLimitExceeded } from './rateLimit';

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

// Import nonprofit tools
import getDonorSummary from './tools/nonprofit/get-donor-summary';
import listDonations from './tools/nonprofit/list-donations';
import getReceiptStatus from './tools/nonprofit/get-receipt-status';
import getCampaignPerformance from './tools/nonprofit/get-campaign-performance';
import getFundBalances from './tools/nonprofit/get-fund-balances';
import getIncomeExpenseSummary from './tools/nonprofit/get-income-expense-summary';
import draftBoardPacket from './tools/nonprofit/draft-board-packet';
import listVolunteerHours from './tools/nonprofit/list-volunteer-hours';
import listConciergeProposals from './tools/nonprofit/list-concierge-proposals';

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

  // Nonprofit tools
  getDonorSummary,
  listDonations,
  getReceiptStatus,
  getCampaignPerformance,
  getFundBalances,
  getIncomeExpenseSummary,
  draftBoardPacket,
  listVolunteerHours,
  listConciergeProposals,
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
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return;
  }
  try {
    const payload = getTokenValidator().validate(authHeader);
    (req as any).userId = payload.sub;
    (req as any).orgId = payload.orgId;
    (req as any).auth = {
      orgId: payload.orgId,
      workerId: payload.sub,
      sub: payload.sub,
      role: 'worker',
    };
    next();
  } catch (err) {
    res.status(401).json({ error: 'AUTH_INVALID' });
  }
}

app.use('/tools', authMiddleware);

function rateLimitMiddleware(req: Request, res: Response, next: express.NextFunction) {
  const identifier = (req as any).userId ?? req.ip ?? 'anonymous';
  getMcpRateLimiter()
    .then(rateLimiter => rateLimiter.consume(identifier))
    .then(() => {
      next();
    })
    .catch((err: unknown) => {
      if (isRateLimitExceeded(err)) {
        res.status(429).json({ error: 'TOO_MANY_REQUESTS' });
        return;
      }
      res.status(503).json({ error: 'RATE_LIMIT_BACKEND_UNAVAILABLE' });
    });
}

app.use('/tools', rateLimitMiddleware);
app.use('/tools/execute', mcpToolSubscriptionGate(), auditMiddleware);

import WorkerService from './services/WorkerService';
const workerService = new WorkerService();

// Central Authorization check for EIN
async function checkEINAuthorization(userId: string, requestedEin: string): Promise<boolean> {
  try {
    const profile = await workerService.getMultiOrgProfile(userId);
    return profile.organizations.some((o: { ein: string }) => o.ein === requestedEin);
  } catch (err) {
    return false; // Error (like NotFound) means unauthorized
  }
}

app.post('/tools/execute', async (req: Request, res: Response) => {
  const { toolName, params } = req.body;
  if (!toolName || typeof toolName !== 'string') {
    res.status(400).json({ error: 'Tool name required' });
    return;
  }

  const tool = toolMap.get(toolName);
  if (!tool) {
    res.status(403).json({ error: 'FEATURE_NOT_ENABLED' });
    return;
  }

  const userId = (req as any).userId;

  // Central Authz Check
  if (params && typeof params.ein === 'string') {
    const isAuthorized = await checkEINAuthorization(userId, params.ein);
    if (!isAuthorized) {
      res.status(403).json({ error: 'FORBIDDEN_EIN', message: `Not authorized to access data for EIN ${params.ein}` });
      return;
    }
  }

  try {
    const context = {
      userId,
      orgId: (req as any).orgId,
    };
    // Cast tool to any to bypass strict parameter count type checking
    const result = await (tool as any).execute(params, context);
    // Tools return stringified json.
    res.type('json').send(result);
  } catch (err: any) {
    if (process.env.SENTRY_DSN) {
      console.error(JSON.stringify({
        level: 'error', type: 'sentry_emulation_event_mcp',
        message: err.message, stack: err.stack,
        context: { toolName, userId }
      }));
    }
    console.error(`[Tool Execution] Error executing tool ${toolName}:`, err);
    res.status(500).json({ error: err.message || 'Internal Tool Error' });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND' });
});

const port = parseInt(process.env['PORT'] ?? '3001', 10);

async function boot(): Promise<void> {
  await initializeMcpRateLimiter();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`mcp-connector listening on ${port}`);
  });
}

// Only listen if not running in a test suite, to avoid open handles
if (require.main === module) {
  boot().catch(err => {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

export default app;
