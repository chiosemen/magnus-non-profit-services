import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createJwtAuthMiddleware } from '@magnus/auth/jwtAuth';
import { validateEnv } from '@magnus/config/envValidator';
import {
  requireFeature,
  FeatureNotEnabledError,
  AuthRequiredError,
  InvalidTokenError,
  SubscriptionNotActiveError,
} from '@magnus/subscription';
import { getOrgComplianceCalendar, getOrgGrants, getOrgOverview } from './orgReadService';

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
app.use(express.json({ limit: '1mb' }));

const jwtAuth = createJwtAuthMiddleware();
const requireCompliance = requireFeature('compliance_calendar');
const requireGrants = requireFeature('grant_generator');

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/api/org/overview', jwtAuth, requireCompliance, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    const overview = await getOrgOverview({ orgId });
    if (!overview) return res.status(404).json({ error: 'ORG_NOT_FOUND' });
    return res.json({ organization: overview });
  } catch (err) {
    return next(err);
  }
});

app.get('/api/org/compliance', jwtAuth, requireCompliance, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    const items = await getOrgComplianceCalendar(orgId);
    return res.json({ orgId, complianceCalendar: items });
  } catch (err) {
    return next(err);
  }
});

app.get('/api/org/grants', jwtAuth, requireGrants, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    const items = await getOrgGrants(orgId);
    return res.json({ orgId, grants: items });
  } catch (err) {
    return next(err);
  }
});

// Generic error handler: keep output stable and avoid leaking internals.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // Subscription errors
  if (err instanceof FeatureNotEnabledError) {
    return res.status(403).json({ error: 'FEATURE_NOT_ENABLED', feature: err.featureKey });
  }
  if (err instanceof SubscriptionNotActiveError) {
    return res.status(403).json({ error: 'SUBSCRIPTION_NOT_ACTIVE' });
  }
  if (err instanceof AuthRequiredError || err instanceof InvalidTokenError) {
    return res.status(401).json({ error: err instanceof AuthRequiredError ? 'AUTH_REQUIRED' : 'INVALID_TOKEN' });
  }

  const code = err instanceof Error && err.message === 'orgId_or_ein_required'
    ? 'ORG_ID_OR_EIN_REQUIRED'
    : 'INTERNAL_ERROR';
  const status = code === 'ORG_ID_OR_EIN_REQUIRED' ? 400 : 500;
  res.status(status).json({ error: code });
});

// Export app for testing
export { app };

// Only call listen() when run directly (not when imported for tests)
if (require.main === module) {
  const port = parseInt(process.env['PORT'] ?? '4010', 10);
  app.listen(port, () => {
    // Intentionally minimal logging.
    // eslint-disable-next-line no-console
    console.log(`org-dashboard-api listening on ${port}`);
  });
}
