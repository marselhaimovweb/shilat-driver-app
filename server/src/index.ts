import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config';
import { getPool } from './db';
import { errorHandler, notFound } from './http';
import { adminRouter } from './routes/admin';
import { authRouter, ensureFirstAdmin } from './routes/auth';
import { customerRouter } from './routes/customer';
import { publicRouter } from './routes/public';
import { expirePendingPayments } from './services/bookings';

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: config.corsOrigins.includes('*') ? true : config.corsOrigins }));
app.use(express.json({ limit: '100kb' }));

app.use('/api/public', publicRouter);
app.use('/api/auth', authRouter);
app.use('/api/me', customerRouter);
app.use('/api/admin', adminRouter);
app.use((_req, _res, next) => next(notFound('נתיב לא קיים')));
app.use(errorHandler);

async function main() {
  await getPool();
  await ensureFirstAdmin();
  setInterval(() => expirePendingPayments().catch((err) => console.error('expire job failed', err)), 60_000);
  app.listen(config.port, () => console.log(`Car wash API listening on :${config.port}`));
}

main().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
