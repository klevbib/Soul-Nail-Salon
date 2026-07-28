// Stale-pending booking reaper (Phase 5).
//
// When deposits are on, a new booking is held as 'pending' until Stripe's
// webhook confirms payment — and a pending booking blocks its slot from other
// customers (the overlap check counts pending + confirmed). If a customer
// abandons checkout, that slot would otherwise be held forever. This sweep
// cancels pending bookings older than `pendingHoldMinutes`, releasing the slot.
//
// The selection rule is a pure function (`stalePending`) so it's unit-testable
// without a DB or clock; the sweep is the thin I/O shell around it.
//
// Only relevant when payments are enabled — with deposits off, bookings are
// created 'confirmed' and never linger as 'pending', so the sweep is not started.

import { prisma } from '../lib/prisma';
import { config } from '../lib/config';

/** The booking fields the reaper rule needs. */
export interface PendingCandidate {
  id: string;
  status: string;
  createdAt: Date;
}

/**
 * Which of `bookings` are stale pending holds to cancel: still 'pending' and
 * created more than `holdMinutes` ago. Pure — the single source of truth for
 * the reaping rule.
 */
export function stalePending<T extends PendingCandidate>(
  bookings: T[],
  now: Date,
  holdMinutes: number,
): T[] {
  const cutoff = new Date(now.getTime() - holdMinutes * 60_000);
  return bookings.filter((b) => b.status === 'pending' && b.createdAt < cutoff);
}

/**
 * Run one reaper sweep. Returns the number of bookings cancelled. `now` is
 * injectable for tests. Uses a guarded updateMany (status still 'pending') so a
 * payment that confirms between the read and the write is never clobbered.
 */
export async function runReaperSweep(now: Date = new Date()): Promise<number> {
  if (!config.paymentsEnabled) return 0;

  const cutoff = new Date(now.getTime() - config.pendingHoldMinutes * 60_000);
  const stale = await prisma.booking.findMany({
    where: { status: 'pending', createdAt: { lt: cutoff } },
    select: { id: true },
  });
  if (stale.length === 0) return 0;

  const result = await prisma.booking.updateMany({
    where: { id: { in: stale.map((b) => b.id) }, status: 'pending' },
    data: { status: 'cancelled' },
  });
  return result.count;
}

/**
 * Start the recurring reaper. Returns the interval timer (or null when payments
 * are off, so nothing runs). The timer is unref'd so it never keeps the process
 * alive on its own.
 */
export function startReaperSweeps(): NodeJS.Timeout | null {
  if (!config.paymentsEnabled) return null;
  const everyMs = config.reaperSweepMinutes * 60_000;
  const timer = setInterval(() => {
    runReaperSweep().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Reaper sweep failed:', err);
    });
  }, everyMs);
  timer.unref?.();
  return timer;
}
