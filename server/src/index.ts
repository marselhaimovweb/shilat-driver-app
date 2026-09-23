import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import helmet from 'helmet';
import { config } from './config';
import { getPool } from './db';
import { errorHandler, notFound } from './http';
import { adminRouter } from './routes/admin';
import { authRouter, ensureFirstAdmin } from './routes/auth';
import { customerRouter } from './routes/customer';
import { paymentsRouter } from './routes/payments';
import { publicRouter } from './routes/public';
import { expirePendingPayments, sendReminders } from './services/bookings';
import { ensureLegalDocs } from './services/legal';
import { expirePendingOrders } from './services/store';

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: config.corsOrigins.includes('*') ? true : config.corsOrigins }));
// product images are uploaded as base64 - only that route gets a large body limit
app.use('/api/admin/store/products/:id/image', express.json({ limit: '4mb' }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

app.use('/api/public', publicRouter);
app.use('/api/auth', authRouter);
app.use('/api/me', customerRouter);
app.use('/api/admin', adminRouter);
app.use('/api/payments', paymentsRouter);

// optional: serve the exported web app (customer site + admin panel) from the same port
const webDir = process.env.WEB_DIR ? path.resolve(process.env.WEB_DIR) : '';
if (webDir && fs.existsSync(path.join(webDir, 'index.html'))) {
  app.use(helmet.contentSecurityPolicy({ useDefaults: true, directives: { 'img-src': ["'self'", 'data:', 'blob:', 'https:'], 'script-src': ["'self'", "'unsafe-inline'"] } }));
  app.use(express.static(webDir, { index: 'index.html', maxAge: '1h' }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(webDir, 'index.html')));
  console.log(`Serving web app from ${webDir}`);
}

app.use((_req, _res, next) => next(notFound('נתיב לא קיים')));
app.use(errorHandler);

async function main() {
  await getPool();
  await ensureFirstAdmin();
  await ensureLegalDocs();
  setInterval(() => {
    expirePendingPayments().catch((err) => console.error('expire job failed', err));
    expirePendingOrders().catch((err) => console.error('order expire job failed', err));
  }, 60_000);
  setInterval(() => sendReminders().catch((err) => console.error('reminder job failed', err)), 5 * 60_000);
  app.listen(config.port, '0.0.0.0', () => console.log(`Car wash API listening on :${config.port}`));
}

main().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
