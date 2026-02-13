import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { loadEnv } from './config/env';
import { prisma } from './db';
import { buildRoutes } from './api/routes';

async function main(): Promise<void> {
  const env = loadEnv();

  // Fail-closed: verify DB reachability at boot.
  await prisma.$queryRaw`SELECT 1`;

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: false }));
  app.use(express.json({ limit: '1mb' }));

  app.use(buildRoutes({ db: prisma, anthropicApiKey: env.ANTHROPIC_API_KEY }));

  // Stable error handler (do not leak internals).
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const msg = err instanceof Error ? err.message : 'INTERNAL_ERROR';
    const code =
      msg === 'PARTNER_TIER_REQUIRED'
      || msg === 'CLAUDE_NOT_ENABLED'
      || msg === 'CLAUDE_NOT_ACTIVE'
      || msg === 'CLAUDE_ALREADY_ONBOARDED'
      || msg === 'ORG_NOT_FOUND'
      || msg === 'COMPLIANCE_DATA_MISSING'
      || msg === 'MCP_CONNECTOR_URL_REQUIRED'
      || msg === 'MCP_CONNECTOR_UNREACHABLE'
      || msg === 'MCP_CONNECTOR_UNHEALTHY'
      || msg === 'CLAUDE_DISABLED_STARTER'
      || msg === 'USAGE_CAP_EXCEEDED'
      || msg === 'USAGE_CAP_INVALID'
      || msg === 'TOKEN_USAGE_UNAVAILABLE'
        ? msg
        : 'INTERNAL_ERROR';
    const status =
      code === 'INTERNAL_ERROR'
        ? 500
        : (code === 'COMPLIANCE_DATA_MISSING' || code === 'MCP_CONNECTOR_URL_REQUIRED')
          ? 400
          : (code === 'MCP_CONNECTOR_UNREACHABLE' || code === 'MCP_CONNECTOR_UNHEALTHY')
            ? 503
            : (code === 'USAGE_CAP_EXCEEDED')
              ? 429
              : 403;
    res.status(status).json({ error: code });
  });

  app.listen(env.PORT, () => {
    // Intentionally minimal logging (no secrets).
    // eslint-disable-next-line no-console
    console.log(`claude-partner listening on ${env.PORT}`);
  });
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
