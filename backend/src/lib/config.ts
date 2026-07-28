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

// ---- Admin (Phase 5) ----
// The dashboard fails CLOSED: unless BOTH a password hash and a session secret
// are configured, every admin endpoint returns 503 rather than allowing
// unauthenticated access. Generate the hash with `npm run admin:hash`.
const adminPasswordHash = (process.env.ADMIN_PASSWORD_HASH ?? '').trim();
const sessionSecret = (process.env.SESSION_SECRET ?? '').trim();
const adminEnabled = adminPasswordHash !== '' && sessionSecret !== '';

export const config = {
  port: num('PORT', 4000),
  corsOrigins: (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  minLeadMinutes: num('MIN_LEAD_MINUTES', 60),
  slotGranularityMinutes: num('SLOT_GRANULARITY_MINUTES', 15),

  // ---- Admin dashboard (Phase 5) ----
  adminPasswordHash,
  sessionSecret,
  adminEnabled,
  // How long an admin login stays valid before re-login is required.
  adminSessionHours: num('ADMIN_SESSION_HOURS', 12),
  // Set the cookie's `Secure` flag in production (HTTPS on Render). Off in dev
  // so the session cookie works over http://localhost. Browsers treat
  // SameSite=Strict as CSRF protection either way.
  cookieSecure: (process.env.NODE_ENV ?? '') === 'production',

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

  // ---- Stale-pending reaper (Phase 5) ----
  // Only relevant when deposits are on: a booking sits 'pending' (holding its
  // slot) until Stripe confirms payment. If the customer abandons checkout the
  // slot would be held forever, so a sweep cancels pending bookings older than
  // pendingHoldMinutes, freeing the slot. No-op when payments are disabled.
  pendingHoldMinutes: num('PENDING_HOLD_MINUTES', 30),
  reaperSweepMinutes: num('REAPER_SWEEP_MINUTES', 10),
};
