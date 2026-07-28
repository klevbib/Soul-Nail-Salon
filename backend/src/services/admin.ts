// Admin actions on bookings — the pure decision logic.
//
// The admin can cancel or complete a booking. Not every transition is legal
// (you can't complete a cancelled booking, etc.), so the allowed moves live
// here as a pure function that the route calls before touching the DB. Keeping
// it pure makes the transition rules unit-testable and keeps routes/admin.ts
// thin.

/** Actions the admin dashboard can take on a booking. */
export type BookingAction = 'cancel' | 'complete';

export interface TransitionResult {
  /** New status to persist, when the transition is allowed. */
  status?: string;
  /** Human-readable reason when the transition is rejected. */
  error?: string;
}

/**
 * Given a booking's current status and a requested action, return the status to
 * move to, or an error explaining why the move isn't allowed.
 *
 *   cancel:   pending | confirmed  -> cancelled
 *   complete: confirmed            -> completed
 *
 * A 'pending' booking can't be completed (its deposit hasn't cleared), and
 * anything already cancelled/completed is terminal.
 */
export function nextStatusForAction(
  current: string,
  action: BookingAction,
): TransitionResult {
  if (current === 'cancelled' || current === 'completed') {
    return { error: `Booking is already ${current}` };
  }

  if (action === 'cancel') {
    if (current === 'pending' || current === 'confirmed') {
      return { status: 'cancelled' };
    }
    return { error: `Cannot cancel a booking that is ${current}` };
  }

  // action === 'complete'
  if (current === 'confirmed') {
    return { status: 'completed' };
  }
  return { error: `Cannot complete a booking that is ${current}` };
}
