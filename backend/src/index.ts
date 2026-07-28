import express from 'express';
import cors from 'cors';
import { config } from './lib/config';
import { servicesRouter } from './routes/services';
import { staffRouter } from './routes/staff';
import { availabilityRouter } from './routes/availability';
import { bookingsRouter } from './routes/bookings';
import { stripeRouter } from './routes/stripe';
import { adminRouter } from './routes/admin';
import { startReminderSweeps } from './jobs/reminders';
import { startReaperSweeps } from './jobs/reaper';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
      // The admin dashboard authenticates with a cookie, so the browser must be
      // allowed to send credentials. This requires an explicit origin allowlist
      // (not "*") — which config.corsOrigins provides.
      credentials: true,
    }),
  );

  // Stripe's webhook must read the raw request body to verify signatures, so it
  // is mounted BEFORE express.json() (which would consume the body first). The
  // route applies its own express.raw() parser. /api/stripe/config is a plain
  // GET with no body, so it's unaffected.
  app.use('/api/stripe', stripeRouter);

  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/services', servicesRouter);
  app.use('/api/staff', staffRouter);
  app.use('/api/availability', availabilityRouter);
  app.use('/api/bookings', bookingsRouter);
  app.use('/api/admin', adminRouter);

  // Centralised error handler.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

// Only start listening when run directly (not when imported by tests).
if (require.main === module) {
  const app = createApp();
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Soul Nail Salon API listening on http://localhost:${config.port}`);
  });
  // Kick off the pre-appointment reminder sweep (no-op when notifications are
  // off). Runs in-process; fine for a single-instance MVP.
  startReminderSweeps();
  // Cancel abandoned pending bookings so held slots free up (no-op when deposits
  // are off — there are no pending bookings then).
  startReaperSweeps();
}
