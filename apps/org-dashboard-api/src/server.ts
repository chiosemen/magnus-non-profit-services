import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createJwtAuthMiddleware } from '@magnus/auth/jwtAuth';
import { validateEnv } from '@magnus/config/envValidator';
import { getOrgComplianceCalendar, getOrgGrants, getOrgOverview } from './orgReadService';
import { registerOrgIdentityFilesRoutes } from './orgIdentityFilesRoutes';
import { registerAgentHandoffRoutes } from './agentHandoffRoutes';

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

registerOrgIdentityFilesRoutes(app, jwtAuth);
registerAgentHandoffRoutes(app, jwtAuth);

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

app.get('/api/org/compliance', jwtAuth, async (req, res, next) => {
  try {
    const orgId = (req as any).auth.orgId as string;
    const items = await getOrgComplianceCalendar(orgId);
    return res.json({ orgId, complianceCalendar: items });
  } catch (err) {
    return next(err);
  }
});

app.get('/api/org/grants', jwtAuth, async (req, res, next) => {
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
  const code = err instanceof Error && err.message === 'orgId_or_ein_required'
    ? 'ORG_ID_OR_EIN_REQUIRED'
    : 'INTERNAL_ERROR';
  const status = code === 'ORG_ID_OR_EIN_REQUIRED' ? 400 : 500;
  res.status(status).json({ error: code });
});

const port = parseInt(process.env['PORT'] ?? '4010', 10);
app.listen(port, () => {
  // Intentionally minimal logging.
  // eslint-disable-next-line no-console
  console.log(`org-dashboard-api listening on ${port}`);
});
