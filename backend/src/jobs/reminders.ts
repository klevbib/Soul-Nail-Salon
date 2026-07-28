// Pre-appointment reminder sweep (Phase 4).
//
// A lightweight in-process job: every few minutes it finds confirmed bookings
// whose start falls inside the reminder window [now, now + leadHours] and that
// haven't been reminded yet, sends the reminder, and stamps `reminderSentAt` so
// each booking is reminded at most once.
//
// The selection rule is a pure function (`remindersDue`) so it can be unit-tested
// without a database or a real clock; the sweep is the thin I/O shell around it.
//
// Free-first: with no notification channels configured the sweep does nothing —
// there is nowhere to send — so it is only started when notifications are on.

import { prisma } from '../lib/prisma';
import { config } from '../lib/config';
import { sendBookingReminder } from '../services/notifications';

/** The booking fields the reminder rule needs. */
export interface ReminderCandidate {
  id: string;
  status: string;
  startTime: Date;
  reminderSentAt: Date | null;
}

/**
 * Which of `bookings` should be reminded right now: confirmed, not already
 * reminded, and starting within the next `leadHours` (and not already past).
 * Pure — the single source of truth for the reminder rule.
 */
export function remindersDue<T extends ReminderCandidate>(
  bookings: T[],
  now: Date,
  leadHours: number,
): T[] {
  const windowEnd = new Date(now.getTime() + leadHours * 3_600_000);
  return bookings.filter(
    (b) =>
      b.status === 'confirmed' &&
      b.reminderSentAt == null &&
      b.startTime > now &&
      b.startTime <= windowEnd,
  );
}

/**
 * Run one reminder sweep. Returns the number of bookings actually reminded.
 * `now` is injectable for tests. A booking is only marked reminded when at least
 * one channel accepted the message, so a transient provider outage is retried on
 * the next sweep rather than silently skipped.
 */
export async function runReminderSweep(now: Date = new Date()): Promise<number> {
  if (!config.notificationsEnabled) return 0;

  const windowEnd = new Date(now.getTime() + config.reminderLeadHours * 3_600_000);
  // Coarse DB prefilter; remindersDue re-applies the exact rule.
  const candidates = await prisma.booking.findMany({
    where: {
      status: 'confirmed',
      reminderSentAt: null,
      startTime: { gt: now, lte: windowEnd },
    },
    select: { id: true, status: true, startTime: true, reminderSentAt: true },
  });

  let sent = 0;
  for (const b of remindersDue(candidates, now, config.reminderLeadHours)) {
    const result = await sendBookingReminder(b.id);
    if (result.emailSent || result.smsSent) {
      await prisma.booking.update({ where: { id: b.id }, data: { reminderSentAt: new Date() } });
      sent += 1;
    }
  }
  return sent;
}

/**
 * Start the recurring sweep. Returns the interval timer (or null when
 * notifications are off, so nothing runs). The timer is unref'd so it never
 * keeps the process alive on its own.
 */
export function startReminderSweeps(): NodeJS.Timeout | null {
  if (!config.notificationsEnabled) return null;
  const everyMs = config.reminderSweepMinutes * 60_000;
  const timer = setInterval(() => {
    runReminderSweep().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Reminder sweep failed:', err);
    });
  }, everyMs);
  timer.unref?.();
  return timer;
}
