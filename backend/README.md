# Soul Nail Salon — Booking API

The backend that powers online booking for Soul Nail Salon: availability,
bookings, Stripe deposits, email/SMS notifications, and a secure admin
dashboard. Node + Express (TypeScript) with Prisma over SQLite (dev) / Postgres
(prod).

For the project overview and the frontend, see the [root README](../README.md).

---

## Quick start

```bash
npm install
cp .env.example .env      # fill in anything you want to enable (see below)
npm run migrate           # create the local SQLite database from the schema
npm run seed              # load services, staff, and opening hours
npm run dev               # API on http://localhost:4000
```

Serve the frontend on **port 8000** (`cd ../frontend && python3 -m http.server
8000`) — that origin is in the dev CORS allowlist — then book at
`http://localhost:8000`.

### Free-first

Every feature is built, but the external providers stay **off** until you add
their keys. With the provider keys blank:

- bookings confirm instantly with **no card taken** (Stripe off),
- **no email/SMS** is sent (Resend/Twilio off),
- the **admin dashboard is locked** (503) until its secrets are set.

So the full system runs locally for free. Going live is swapping in real keys —
no code changes.

---

## Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Start the API with hot reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server (`dist/index.js`) |
| `npm test` | Run the unit-test suite (Vitest) |
| `npm run migrate` | Apply Prisma migrations to the dev database |
| `npm run generate` | Regenerate the Prisma client after a schema change |
| `npm run seed` | Seed services / staff / opening hours |
| `npm run admin:hash -- "your-password"` | Print an `ADMIN_PASSWORD_HASH` + `SESSION_SECRET` for `.env` |

---

## Environment variables

Copy `.env.example` to `.env`. Everything has a working default or is optional;
leave a provider's keys blank to keep that feature off.

### Core

| Var | Default | Purpose |
| --- | ------- | ------- |
| `DATABASE_URL` | `file:./dev.db` | SQLite file in dev; a Postgres URL in prod |
| `PORT` | `4000` | Port the API listens on |
| `CORS_ORIGIN` | `localhost:8000,127.0.0.1:8000` | Comma-separated allowlist of frontend origins |
| `MIN_LEAD_MINUTES` | `60` | Minimum notice before the earliest bookable slot |
| `SLOT_GRANULARITY_MINUTES` | `15` | Slot spacing in availability |
| `NODE_ENV` | — | Set to `production` in prod (enables the `Secure` cookie flag) |

### Stripe deposits (Phase 3) — off unless `STRIPE_SECRET_KEY` is set

| Var | Purpose |
| --- | ------- |
| `STRIPE_SECRET_KEY` | `sk_test_…` / `sk_live_…`; enables the deposit flow |
| `STRIPE_WEBHOOK_SECRET` | From `stripe listen` (dev) or the dashboard (prod) |
| `STRIPE_PUBLISHABLE_KEY` | `pk_…`; sent to the browser to load Stripe.js |

### Email — Resend (Phase 4) — off unless `RESEND_API_KEY` is set

| Var | Purpose |
| --- | ------- |
| `RESEND_API_KEY` | Enables confirmation + reminder emails |
| `FROM_EMAIL` | From address for outgoing mail |

### SMS — Twilio (Phase 4) — off unless all three are set

| Var | Purpose |
| --- | ------- |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | Enable SMS confirmation + reminders |

### Notifications tuning (optional)

| Var | Default | Purpose |
| --- | ------- | ------- |
| `SALON_NAME` | `Soul Nail Salon` | Name shown in messages |
| `REMINDER_LEAD_HOURS` | `24` | How far ahead of an appointment to remind |
| `REMINDER_SWEEP_MINUTES` | `15` | How often the reminder job runs |

### Admin dashboard (Phase 5) — locked until both are set

| Var | Default | Purpose |
| --- | ------- | ------- |
| `ADMIN_PASSWORD_HASH` | — | scrypt hash of the admin password (from `npm run admin:hash`) |
| `SESSION_SECRET` | — | Random secret signing session cookies; rotating it logs everyone out |
| `ADMIN_SESSION_HOURS` | `12` | How long a login stays valid |

### Stale-pending reaper (Phase 5, deposits only)

| Var | Default | Purpose |
| --- | ------- | ------- |
| `PENDING_HOLD_MINUTES` | `30` | Cancel an unpaid `pending` booking after this long, freeing its slot |
| `REAPER_SWEEP_MINUTES` | `10` | How often the reaper runs |

---

## Architecture

Requests flow **route → service → lib/db**, with background **jobs** and auth
**middleware** alongside:

```
src/
├── index.ts          App wiring: CORS, JSON parsing, route mounting, job startup
├── lib/              Shared infrastructure
│   ├── config.ts     Single typed view of all env vars (+ derived *Enabled flags)
│   ├── prisma.ts     Shared Prisma client
│   ├── auth.ts       scrypt hashing, HMAC session tokens, cookie parsing
│   ├── rateLimit.ts  In-memory fixed-window limiter (admin login)
│   └── stripe.ts / resend.ts / twilio.ts   Lazy provider clients (null when disabled)
├── middleware/
│   └── requireAdmin.ts   Admin auth gate (fails closed → 503 when unconfigured)
├── routes/           Thin HTTP handlers: services, staff, availability,
│                     bookings, stripe (config + webhook), admin
├── services/         Business logic — the interesting code
│   ├── availability.ts   Slot generation + overlap exclusion (pure)
│   ├── booking.ts        Booking creation + double-booking guard (Serializable tx)
│   ├── payments.ts       Stripe deposit intents + webhook state mapping
│   ├── notifications.ts  Email/SMS formatters + best-effort senders
│   └── admin.ts          Booking status-transition rules (pure)
└── jobs/             In-process sweeps (unref'd setInterval, no-op when disabled)
    ├── reminders.ts      Pre-appointment reminders
    └── reaper.ts         Cancel abandoned pending bookings
```

**Convention — pure core, thin I/O shell.** The tricky logic (availability,
slot validation, status transitions, reminder/reaper selection, auth) is written
as pure functions with the clock and data passed in, so it's unit-tested without
a database or real time. Routes and jobs are the thin shells that do I/O around
them. Follow this pattern when adding features.

**Concurrency.** Double-booking is prevented inside a Serializable transaction
that re-checks overlaps before insert (SQLite has no exclusion constraint; the
same holds on Postgres). Network calls (Stripe) happen *after* the transaction
commits, never while holding a write lock.

---

## API

Public:

| Method & path | Purpose |
| ------------- | ------- |
| `GET /api/health` | Liveness check |
| `GET /api/services` | List bookable services |
| `GET /api/staff?serviceId=` | Technicians (optionally for a service) |
| `GET /api/availability?serviceId=&staffId=&date=YYYY-MM-DD` | Open slots for a day |
| `POST /api/bookings` | Create a booking |
| `GET /api/stripe/config` | Publishable key + whether deposits are on |
| `POST /api/stripe/webhook` | Stripe events (raw body, signature-verified) |

Admin (cookie session; every route except `login` requires it, and all 503 when
the dashboard is unconfigured):

| Method & path | Purpose |
| ------------- | ------- |
| `POST /api/admin/login` · `POST /api/admin/logout` · `GET /api/admin/me` | Auth |
| `GET /api/admin/bookings?status=&from=&to=` | List / filter bookings |
| `PATCH /api/admin/bookings/:id` | `{ action: "cancel" \| "complete" }` |
| `GET/POST/DELETE /api/admin/timeoff` | Manage technician time off |

### Admin auth model

- Password is never stored — only a **scrypt hash** (`ADMIN_PASSWORD_HASH`).
- Login issues an **HMAC-signed session** set as an **HttpOnly, SameSite=Strict**
  cookie (unreadable by JS, not sent cross-site).
- Comparisons are constant-time; logins are **rate-limited** (10 / 15 min / IP).
- The surface **fails closed**: no secrets ⇒ every admin route returns 503.

---

## Testing

```bash
npm test
```

Vitest covers the pure business logic (`*.test.ts` beside each module):
availability, booking validation, payment state mapping, notification
formatters, admin transitions, auth (hashing/tokens/cookies), rate limiting, and
the reaper/reminder selectors.

---

## Data model

Prisma models (`prisma/schema.prisma`): **Service**, **Staff**, **StaffService**
(who performs what), **BusinessHours** (per weekday), **TimeOff** (per-staff
blocks), and **Booking**. Two SQLite-driven choices: `status` is a `String`
(no enums — allowed values documented on the field) and money is integer
**pence** (no Decimal type, and it avoids float rounding). Both port cleanly to
Postgres.

To evolve the schema: edit `schema.prisma`, then `npm run migrate` (creates a
migration + regenerates the client).
