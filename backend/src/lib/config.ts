import 'dotenv/config';

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const stripeSecretKey = (process.env.STRIPE_SECRET_KEY ?? '').trim();

// ---- Notifications (Phase 4) ----
// Free-first, same shape as Stripe: with no provider key a channel is simply
// off and every send is a logged no-op, so the booking flow works unchanged.
// Email (Resend) and SMS (Twilio) switch on independently by filling their keys.
const resendApiKey = (process.env.RESEND_API_KEY ?? '').trim();
const twilioAccountSid = (process.env.TWILIO_ACCOUNT_SID ?? '').trim();
const twilioAuthToken = (process.env.TWILIO_AUTH_TOKEN ?? '').trim();
const twilioFromNumber = (process.env.TWILIO_FROM_NUMBER ?? '').trim();

const emailEnabled = resendApiKey !== '';
const smsEnabled = twilioAccountSid !== '' && twilioAuthToken !== '' && twilioFromNumber !== '';

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

  // ---- Notifications (Phase 4) ----
  salonName: (process.env.SALON_NAME ?? 'Soul Nail Salon').trim(),

  resendApiKey,
  fromEmail: (process.env.FROM_EMAIL ?? '').trim(),
  emailEnabled,

  twilioAccountSid,
  twilioAuthToken,
  twilioFromNumber,
  smsEnabled,

  // Whether any channel is on — lets callers skip work (e.g. the reminder
  // sweep) entirely when nothing would be sent.
  notificationsEnabled: emailEnabled || smsEnabled,

  // Reminder job: how far ahead of an appointment to send the reminder, and how
  // often the sweep runs. A booking is reminded once, when it falls inside the
  // window [now, now + reminderLeadHours].
  reminderLeadHours: num('REMINDER_LEAD_HOURS', 24),
  reminderSweepMinutes: num('REMINDER_SWEEP_MINUTES', 15),
};
