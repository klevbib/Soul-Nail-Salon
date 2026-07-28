# Soul Nail Salon

A website and **online booking system** for **Soul Nail Salon**, a boutique nail
salon in Altrincham. Visitors can browse services, portfolio, and story, then
book an appointment online — picking a service, technician, and time, paying a
deposit, and receiving email/SMS confirmations. Salon staff manage bookings
through a lightweight admin dashboard.

The project has two parts:

- **`frontend/`** — the public site: plain HTML, CSS, and vanilla JavaScript, no
  build step. Hostable on any static host. Talks to the API over `fetch`.
- **`backend/`** — a Node + Express + Prisma API that powers booking,
  availability, deposits, notifications, and the admin dashboard.

The frontend still works as a plain static site on its own; the booking widget
degrades gracefully to a "call us" message when the API isn't reachable.

---

## Running locally

### Frontend (static site)

```bash
cd frontend
python3 -m http.server 8000
# then visit http://localhost:8000
```

Any static file server works (e.g. `npx serve`). The booking widget expects the
API at `http://localhost:4000` in local dev (see `frontend/js/booking.js`).

### Backend (booking API)

```bash
cd backend
npm install
cp .env.example .env         # then fill in anything you want to enable
npm run migrate              # create the local SQLite database
npm run seed                 # load services, staff, and opening hours
npm run dev                  # API on http://localhost:4000
```

Serve the frontend on **port 8000** alongside it — that origin is in the API's
dev CORS allowlist (`CORS_ORIGIN` in `.env`). Then walk the flow at
`http://localhost:8000`: pick a service → technician → time → book.

**Free-first principle:** every feature is built, but the paid/external
providers (Stripe, Resend, Twilio) stay **disabled** until you add their keys.
With the keys blank, bookings confirm instantly with no card and no messages —
so the whole system runs locally for free. Going live is just swapping in real
keys.

Useful backend scripts:

| Command | What it does |
| ------- | ------------ |
| `npm run dev` | Start the API with hot reload |
| `npm test` | Run the unit-test suite (Vitest) |
| `npm run migrate` | Apply Prisma migrations to the dev database |
| `npm run seed` | Seed services / staff / opening hours |
| `npm run admin:hash -- "your-password"` | Generate an admin password hash for `.env` |

---

## The booking system

Built in five independently-shippable phases (all complete):

1. **Backend + data** — Express app, Prisma schema (Service, Staff,
   BusinessHours, TimeOff, Booking), seed data, and a unit-tested availability
   engine. `GET /api/services`, `/staff`, `/availability`.
2. **Core booking** — `POST /api/bookings` with a double-booking guard
   (Serializable transaction), plus the multi-step booking widget in the
   homepage accordion.
3. **Deposits** — Stripe Payment Intents + webhook; a booking is held `pending`
   until the deposit succeeds. Enabled by setting `STRIPE_SECRET_KEY`.
4. **Notifications** — confirmation email (Resend) + SMS (Twilio), and a
   pre-appointment reminder job. Each channel switches on independently via its
   keys.
5. **Admin dashboard** — a secure, staff-only page to view/filter bookings,
   cancel or complete them, and block off technician time. A background reaper
   also cancels abandoned `pending` bookings so held slots free up.

### API surface

| Method & path | Purpose |
| ------------- | ------- |
| `GET /api/services` | List bookable services |
| `GET /api/staff?serviceId=` | Technicians (optionally for a service) |
| `GET /api/availability?serviceId=&staffId=&date=` | Open slots for a day |
| `POST /api/bookings` | Create a booking |
| `GET /api/stripe/config`, `POST /api/stripe/webhook` | Deposit flow |
| `POST /api/admin/login` · `/logout` · `GET /api/admin/me` | Admin auth |
| `GET/PATCH /api/admin/bookings` | View / cancel / complete bookings |
| `GET/POST/DELETE /api/admin/timeoff` | Manage technician time off |

### Admin dashboard

Served at `frontend/admin.html` (staff-only, `noindex`). Authentication is a
single shared password, handled securely:

- the password is never stored — only a **scrypt hash** (`ADMIN_PASSWORD_HASH`);
- login issues an **HMAC-signed session in an HttpOnly, SameSite=Strict cookie**,
  so it can't be read by JavaScript or replayed cross-site;
- logins are **rate-limited**, and the whole admin surface **fails closed** —
  every endpoint returns `503` until `ADMIN_PASSWORD_HASH` and `SESSION_SECRET`
  are set.

Set it up with:

```bash
cd backend
npm run admin:hash -- "a-strong-password"   # prints the two lines to add to .env
```

---

## Project structure

```
Soul-Nail-Salon/
├── README.md
├── .gitignore
├── frontend/                     # Public static site (+ admin page)
│   ├── index.html                # Homepage: hero + booking accordion
│   ├── admin.html                # Staff-only bookings dashboard
│   ├── portfolio.html            # Filterable image gallery + lightbox
│   ├── about.html                # Salon story and values
│   ├── privacy-policy.html       # Legal pages
│   ├── terms-and-conditions.html
│   ├── css/style.css             # Single global stylesheet
│   ├── js/
│   │   ├── transitions.js        # Page fade + mobile nav (loaded everywhere)
│   │   ├── home.js               # Homepage accordion
│   │   ├── booking.js            # Multi-step booking widget (calls the API)
│   │   ├── admin.js              # Admin dashboard logic
│   │   └── portfolio.js          # Gallery filtering + lightbox
│   └── assets/                   # Logos, posters, portfolio photos
└── backend/                      # Booking API (Node + Express + Prisma)
    ├── prisma/                   # schema.prisma, migrations, seed
    ├── scripts/hash-password.ts  # Admin password-hash generator
    └── src/
        ├── index.ts              # App wiring (routes, CORS, jobs)
        ├── lib/                  # config, prisma, auth, providers, rate limit
        ├── routes/               # services, staff, availability, bookings,
        │                         #   stripe, admin
        ├── services/             # booking, availability, payments,
        │                         #   notifications, admin (business logic)
        ├── middleware/           # requireAdmin (auth gate)
        └── jobs/                 # reminders + stale-pending reaper
```

---

## Tech stack

| Layer | Choice | Reason |
| ----- | ------ | ------ |
| Frontend | HTML / CSS / vanilla JS, no build | Simple, fast, host anywhere |
| API | Node + Express (TypeScript) | Small, well-understood, easy to deploy |
| ORM / DB | Prisma; SQLite (dev) / Postgres (prod) | One schema, portable |
| Payments | Stripe (deposits) | Env-gated, off by default |
| Email / SMS | Resend / Twilio | Env-gated, off by default |
| Tests | Vitest | Pure business logic is unit-tested |
| Hosting (planned) | Render (web + Postgres) | One dashboard, always-on, simple deploys |

---

## Deploying (going live)

The code is complete; going live is configuration only:

1. Set a real admin password (`npm run admin:hash`) and a random `SESSION_SECRET`.
2. Add live keys for any providers you want on (Stripe / Resend / Twilio).
3. Point `DATABASE_URL` at Postgres and switch the Prisma datasource provider.
4. Deploy the backend to Render (or similar) with `NODE_ENV=production` — this
   also enables the `Secure` flag on the session cookie.
5. Serve the frontend from the same origin (the API is under `/api` in prod).

---

## Editing content

- **Services & pricing** — seeded in `backend/prisma/seed.ts` (the source of
  truth the booking API reads). The static list on `index.html` mirrors it.
- **Technicians & opening hours** — also in the seed; block off individual
  time via the admin dashboard.
- **Contact details, address** — appear in the nav/panels/footer of every page;
  update them everywhere they occur (no templating).
- **Portfolio images** — add a `.png` to `frontend/assets/portfolio/`, then add a
  matching `.gallery-item` in `portfolio.html` with `data-category` set to one of
  `manicure`, `nail-art`, `gel`, or `acrylic`.
