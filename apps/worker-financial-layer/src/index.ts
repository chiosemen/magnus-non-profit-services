import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { validateEnv } from '@magnus/config/envValidator';
import { loadEnv } from './config/env';
import { prisma } from './db';
import { buildRoutes } from './api/routes';

async function main(): Promise<void> {
  validateEnv('worker-financial-layer');
  const env = loadEnv();

  // Fail-closed: DB must be reachable.
  await prisma.$queryRaw`SELECT 1`;

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: false }));
  app.use(express.json({ limit: '1mb' }));

  app.use(buildRoutes(prisma));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const msg = err instanceof Error ? err.message : 'INTERNAL_ERROR';
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  });

  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`worker-financial-layer listening on ${env.PORT}`);
  });
}

main().catch(err => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
