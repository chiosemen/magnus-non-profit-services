import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createJwtAuthMiddleware } from '@magnus/auth/jwtAuth';
import { validateEnv } from '@magnus/config/envValidator';
import { getOrgComplianceCalendar, getOrgGrants, getOrgOverview } from './orgReadService';
import { registerOrgIdentityFilesRoutes } from './orgIdentityFilesRoutes';
import { registerAgentHandoffRoutes } from './agentHandoffRoutes';
import { registerMemoryRoutes } from './memoryRoutes';
import { registerAutonomousOpsSettingsRoutes } from './autonomousOpsSettingsRoutes';
import { registerControlTowerRoutes } from './controlTowerRoutes';
import { registerAlertLifecycleRoutes } from './alertLifecycleRoutes';
import { registerExecutiveRollupRoutes } from './executiveRollupRoutes';
import { registerObligationRoutes } from './obligationRoutes';
import { registerDonorEventRoutes } from './donorEventRoutes';
import { registerVolunteerEventRoutes } from './volunteerEventRoutes';
import { registerOperationsLogRoutes } from './operationsLogRoutes';
import { registerDonorCrmRoutes } from './donorCrmRoutes';
import { registerConciergeRoutes } from './conciergeRoutes';
import { registerPublicDonationRoutes } from './publicDonationRoutes';
import { registerFundAccountingRoutes } from './fundAccountingRoutes';
import Stripe from 'stripe';
import { createStripeConnectGateway, registerStripeConnectRoutes } from './stripeConnectRoutes';
import { registerCampaignRoutes } from './campaignRoutes';
import prisma from '@magnus/db/client';
import type { PrismaClient } from '@magnus/db/types';
import { assertDbShape, MAGNUS_ACCORD_AUTONOMOUS_OPS_SHAPE } from '@magnus/db/types';
import {
  createOrgDashboardRateLimitMiddleware,
  initializeOrgDashboardRateLimiter,
} from './rateLimit';

try {
  validateEnv('org-dashboard-api');
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: false })); // API-first; caller should proxy in production.
app.use(express.json({
  limit: '1mb',
  verify: (req: any, _res: any, buf: Buffer) => {
    req.rawBody = buf.toString();
  }
}));

const orgDashboardRateLimit = createOrgDashboardRateLimitMiddleware();
app.use('/api/org', orgDashboardRateLimit);

const jwtAuth = createJwtAuthMiddleware();
const stripe = new Stripe(process.env['STRIPE_SECRET_KEY']!, {
  apiVersion: '2024-06-20' as any,
});
const stripeGateway = createStripeConnectGateway(stripe);

registerOrgIdentityFilesRoutes(app, jwtAuth);
registerAgentHandoffRoutes(app, jwtAuth);
registerMemoryRoutes(app, jwtAuth);
registerAutonomousOpsSettingsRoutes(app, jwtAuth);
registerControlTowerRoutes(app, jwtAuth);
registerAlertLifecycleRoutes(app, jwtAuth);
registerExecutiveRollupRoutes(app, jwtAuth);
registerObligationRoutes(app, jwtAuth);
registerDonorEventRoutes(app, jwtAuth);
registerVolunteerEventRoutes(app, jwtAuth);
registerOperationsLogRoutes(app, jwtAuth);
registerDonorCrmRoutes(app, jwtAuth);
registerStripeConnectRoutes(app, jwtAuth, { gateway: stripeGateway });
registerCampaignRoutes(app, jwtAuth);
registerPublicDonationRoutes(app);
registerFundAccountingRoutes(app, jwtAuth);
registerConciergeRoutes(app, jwtAuth);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/api/org/overview', jwtAuth, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    const overview = await getOrgOverview({ orgId });
    if (!overview) return res.status(404).json({ error: 'ORG_NOT_FOUND' });
    return res.json({ organization: overview });
  } catch (err) {
    return next(err);
  }
});

import { registerGrantRoutes } from './grantRoutes';
import { registerComplianceRoutes } from './complianceRoutes';
import { registerExecutivePacketRoutes } from './executivePacketRoutes';
import { registerVolunteerRoutes } from './volunteerRoutes';
import { registerBoardPacketRoutes } from './boardPacketRoutes';

registerGrantRoutes(app, jwtAuth);
registerComplianceRoutes(app, jwtAuth);
registerExecutivePacketRoutes(app, jwtAuth);
registerVolunteerRoutes(app, jwtAuth);
registerBoardPacketRoutes(app, jwtAuth);


// Generic error handler: keep output stable and avoid leaking internals.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (process.env.SENTRY_DSN) {
    console.error(JSON.stringify({
      level: 'error', type: 'sentry_emulation_event_org_dashboard',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }));
  }
  const code = err instanceof Error && err.message === 'orgId_or_ein_required'
    ? 'ORG_ID_OR_EIN_REQUIRED'
    : 'INTERNAL_ERROR';
  const status = code === 'ORG_ID_OR_EIN_REQUIRED' ? 400 : 500;
  res.status(status).json({ error: code });
});

const port = parseInt(process.env['PORT'] ?? '4010', 10);

async function boot(): Promise<void> {
  // Fail-closed: DB reachable + schema compatible for all Autonomous Ops routes.
  await (prisma as unknown as PrismaClient).$queryRaw`SELECT 1`;
  await assertDbShape(prisma as any, MAGNUS_ACCORD_AUTONOMOUS_OPS_SHAPE);
  await initializeOrgDashboardRateLimiter();

  app.listen(port, () => {
    // Intentionally minimal logging.
    // eslint-disable-next-line no-console
    console.log(`org-dashboard-api listening on ${port}`);
  });
}

boot().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
