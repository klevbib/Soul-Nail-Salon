import { Router, raw } from 'express';
import { getStripe } from '../lib/stripe';
import { config } from '../lib/config';
import { prisma } from '../lib/prisma';
import { bookingUpdateForEvent } from '../services/payments';

export const stripeRouter = Router();

// GET /api/stripe/config — lets the frontend discover whether deposits are on
// and, if so, the publishable key it needs to load Stripe.js. Safe to expose:
// the publishable key is not a secret.
stripeRouter.get('/config', (_req, res) => {
  res.json({
    paymentsEnabled: config.paymentsEnabled,
    publishableKey: config.stripePublishableKey,
  });
});

// POST /api/stripe/webhook — Stripe calls this when a payment's state changes.
//
// Signature verification needs the exact raw request bytes, so this route parses
// the body with express.raw and is mounted BEFORE the global express.json()
// (see index.ts). Anything that reads req.body as JSON first would break it.
stripeRouter.post('/webhook', raw({ type: 'application/json' }), async (req, res) => {
  const stripe = getStripe();
  if (!stripe || !config.stripeWebhookSecret) {
    return res.status(503).json({ error: 'Payments are not enabled' });
  }

  const signature = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature as string,
      config.stripeWebhookSecret,
    );
  } catch {
    // Bad/spoofed signature — reject without touching any booking.
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  const update = bookingUpdateForEvent(event.type);
  if (update) {
    const intent = event.data.object as { id: string; metadata?: { bookingId?: string } };
    const bookingId = intent.metadata?.bookingId;
    // updateMany (not update) so an event for an unknown/already-handled booking
    // is a harmless no-op rather than a throw. Only move bookings still awaiting
    // payment, so a late event can't resurrect a cancelled/completed booking.
    await prisma.booking.updateMany({
      where: {
        status: 'pending',
        ...(bookingId ? { id: bookingId } : { stripePaymentIntentId: intent.id }),
      },
      data: update,
    });
  }

  // Always 200 a verified event so Stripe stops retrying.
  res.json({ received: true });
});
