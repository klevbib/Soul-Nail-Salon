// Admin dashboard API (Phase 5).
//
// Auth model (see lib/auth.ts for the crypto): the salon owner logs in with a
// shared password; the server verifies it against a scrypt hash and issues an
// HttpOnly, SameSite=Strict session cookie. Every mutating/reading route below
// (except login) is behind `requireAdmin`. The whole surface fails closed when
// the dashboard isn't configured.
//
// Endpoints:
//   POST   /api/admin/login             { password }        -> sets cookie
//   POST   /api/admin/logout                                -> clears cookie
//   GET    /api/admin/me                                    -> { ok } if authed
//   GET    /api/admin/bookings          ?status=&from=&to=  -> [ bookings ]
//   PATCH  /api/admin/bookings/:id       { action }         -> updated booking
//   GET    /api/admin/timeoff                               -> [ time-off ]
//   POST   /api/admin/timeoff            { staffId, ... }   -> created block
//   DELETE /api/admin/timeoff/:id                           -> { ok }

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { config } from '../lib/config';
import { createSessionToken, verifyPassword } from '../lib/auth';
import { createRateLimiter } from '../lib/rateLimit';
import { nextStatusForAction } from '../services/admin';
import { requireAdmin, SESSION_COOKIE } from '../middleware/requireAdmin';

export const adminRouter = Router();

// Brute-force defence: at most 10 login attempts per IP per 15 minutes.
const loginLimiter = createRateLimiter(10, 15 * 60_000);

function sessionCookieOptions(maxAgeMs?: number) {
  return {
    httpOnly: true, // not readable by JS — an XSS bug can't steal the session
    secure: config.cookieSecure, // HTTPS-only in production
    sameSite: 'strict' as const, // cookie not sent on cross-site requests (CSRF)
    path: '/',
    ...(maxAgeMs != null ? { maxAge: maxAgeMs } : {}),
  };
}

// ---- Auth ----

const loginSchema = z.object({ password: z.string().min(1).max(200) });

adminRouter.post('/login', (req, res) => {
  if (!config.adminEnabled) {
    return res.status(503).json({ error: 'Admin dashboard is not configured' });
  }

  // Rate-limit by client IP before doing any (deliberately slow) hashing work.
  const ip = req.ip || 'unknown';
  const limit = loginLimiter.hit(ip, new Date());
  if (!limit.allowed) {
    res.setHeader('Retry-After', Math.ceil(limit.retryAfterMs / 1000));
    return res.status(429).json({ error: 'Too many attempts — please wait and try again' });
  }

  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Password required' });
  }

  if (!verifyPassword(parsed.data.password, config.adminPasswordHash)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const ttlMs = config.adminSessionHours * 3_600_000;
  const token = createSessionToken(config.sessionSecret, new Date(), ttlMs);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(ttlMs));
  res.json({ ok: true });
});

adminRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  res.json({ ok: true });
});

// Lightweight check the dashboard calls on load to know if it's still logged in.
adminRouter.get('/me', requireAdmin, (_req, res) => {
  res.json({ ok: true });
});

// ---- Bookings ----

const bookingsQuerySchema = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

adminRouter.get('/bookings', requireAdmin, async (req, res) => {
  const parsed = bookingsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { status, from, to } = parsed.data;

  const startTime =
    from || to
      ? { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) }
      : undefined;

  const bookings = await prisma.booking.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(startTime ? { startTime } : {}),
    },
    orderBy: { startTime: 'asc' },
    include: {
      service: { select: { name: true } },
      staff: { select: { name: true } },
    },
  });

  res.json({
    bookings: bookings.map((b) => ({
      id: b.id,
      serviceName: b.service.name,
      staffName: b.staff.name,
      customerName: b.customerName,
      customerEmail: b.customerEmail,
      customerPhone: b.customerPhone,
      startTime: b.startTime.toISOString(),
      endTime: b.endTime.toISOString(),
      status: b.status,
      depositPaid: b.depositPaid,
      createdAt: b.createdAt.toISOString(),
    })),
  });
});

const patchBookingSchema = z.object({ action: z.enum(['cancel', 'complete']) });

adminRouter.patch('/bookings/:id', requireAdmin, async (req, res) => {
  const parsed = patchBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "action must be 'cancel' or 'complete'" });
  }

  const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const { status, error } = nextStatusForAction(booking.status, parsed.data.action);
  if (error || !status) {
    return res.status(409).json({ error: error ?? 'Invalid transition' });
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { status },
  });
  res.json({ booking: { id: updated.id, status: updated.status } });
});

// ---- Time off ----

adminRouter.get('/timeoff', requireAdmin, async (_req, res) => {
  const now = new Date();
  const blocks = await prisma.timeOff.findMany({
    where: { endTime: { gte: now } }, // upcoming/active blocks only
    orderBy: { startTime: 'asc' },
    include: { staff: { select: { name: true } } },
  });
  res.json({
    timeOff: blocks.map((t) => ({
      id: t.id,
      staffId: t.staffId,
      staffName: t.staff.name,
      startTime: t.startTime.toISOString(),
      endTime: t.endTime.toISOString(),
      reason: t.reason,
    })),
  });
});

const timeOffSchema = z
  .object({
    staffId: z.string().min(1),
    startTime: z.string().datetime({ offset: true }),
    endTime: z.string().datetime({ offset: true }),
    reason: z.string().trim().max(200).optional(),
  })
  .refine((v) => new Date(v.endTime) > new Date(v.startTime), {
    message: 'endTime must be after startTime',
  });

adminRouter.post('/timeoff', requireAdmin, async (req, res) => {
  const parsed = timeOffSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const data = parsed.data;

  const staff = await prisma.staff.findUnique({ where: { id: data.staffId } });
  if (!staff) {
    return res.status(404).json({ error: 'Technician not found' });
  }

  const block = await prisma.timeOff.create({
    data: {
      staffId: data.staffId,
      startTime: new Date(data.startTime),
      endTime: new Date(data.endTime),
      reason: data.reason || null,
    },
  });
  res.status(201).json({
    timeOff: {
      id: block.id,
      staffId: block.staffId,
      startTime: block.startTime.toISOString(),
      endTime: block.endTime.toISOString(),
      reason: block.reason,
    },
  });
});

adminRouter.delete('/timeoff/:id', requireAdmin, async (req, res) => {
  try {
    await prisma.timeOff.delete({ where: { id: req.params.id } });
  } catch {
    return res.status(404).json({ error: 'Time-off block not found' });
  }
  res.json({ ok: true });
});
