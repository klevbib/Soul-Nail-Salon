import 'dotenv/config';

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const stripeSecretKey = (process.env.STRIPE_SECRET_KEY ?? '').trim();

export const config = {
  port: num('PORT', 4000),
  corsOrigins: (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  minLeadMinutes: num('MIN_LEAD_MINUTES', 60),
  slotGranularityMinutes: num('SLOT_GRANULARITY_MINUTES', 15),
  adminToken: process.env.ADMIN_TOKEN ?? '',

  // ---- Stripe deposits (Phase 3) ----
  // Free-first: with no secret key, payments are disabled and a booking is
  // confirmed on creation (as in Phase 2). Set the key to switch on the deposit
  // flow — bookings then stay 'pending' until Stripe confirms payment.
  stripeSecretKey,
  stripeWebhookSecret: (process.env.STRIPE_WEBHOOK_SECRET ?? '').trim(),
  stripePublishableKey: (process.env.STRIPE_PUBLISHABLE_KEY ?? '').trim(),
  paymentsEnabled: stripeSecretKey !== '',
};
