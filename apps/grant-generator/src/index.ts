import { validateEnv } from '@magnus/config';
validateEnv('grant-generator');

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: false })); // API-first; proxy should set CORS in production.

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND' }));

const port = parseInt(process.env['PORT'] ?? '3002', 10);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`grant-generator listening on ${port}`);
});

