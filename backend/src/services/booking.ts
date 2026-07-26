// Booking creation.
//
// `createBooking` turns a customer's chosen service + start time (+ optional
// technician) into a persisted Booking. The hard part is preventing
// double-bookings: SQLite has no exclusion constraint, so we can't lean on the
// database to reject two appointments that overlap the same technician.
//
// The guard is therefore a transactional check: inside a Serializable
// transaction we re-check for overlapping bookings/time-off and only insert if
// the technician is still free. Two validation concerns are split out as pure
// functions (`validateSlot`, `endTimeFor`) so they can be unit-tested without a
// database or clock.
//
// Times are handled in the server's local timezone (run the server in
// Europe/London — see availability.ts for the same note).

import { prisma } from '../lib/prisma';
import { config } from '../lib/config';
import { overlaps } from './availability';
import { createDepositIntent } from './payments';

export class BookingError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** End time of an appointment given its start and the service duration. */
export function endTimeFor(start: Date, durationMinutes: number): Date {
  return new Date(start.getTime() + durationMinutes * 60_000);
}

export interface SlotValidationParams {
  start: Date;
  end: Date;
  /** Minutes from midnight the salon opens/closes that weekday; null = closed. */
  openMin: number | null;
  closeMin: number | null;
  now: Date;
  minLeadMinutes: number;
}

/**
 * Validate that a requested [start, end) is a legitimate time to book:
 * far enough in the future, and fully inside the salon's opening hours for
 * that day. Returns null when valid, or a human-readable reason when not.
 *
 * This is intentionally independent of technician availability (the overlap
 * check handles that) so it stays pure and easy to test.
 */
export function validateSlot(p: SlotValidationParams): string | null {
  if (p.openMin == null || p.closeMin == null) {
    return 'The salon is closed on that day';
  }

  const earliest = new Date(p.now.getTime() + p.minLeadMinutes * 60_000);
  if (p.start < earliest) {
    return 'That time is too soon or in the past';
  }

  // Opening/closing instants for the start's calendar day.
  const dayStart = new Date(p.start.getFullYear(), p.start.getMonth(), p.start.getDate(), 0, 0, 0, 0);
  const open = new Date(dayStart.getTime() + p.openMin * 60_000);
  const close = new Date(dayStart.getTime() + p.closeMin * 60_000);

  if (p.start < open || p.end > close) {
    return 'That time is outside opening hours';
  }
  return null;
}

export interface CreateBookingInput {
  serviceId: string;
  /** Optional: request a specific technician. Omitted => any qualified one. */
  staffId?: string;
  /** Requested appointment start (already parsed to a local Date). */
  startTime: Date;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
}

export interface CreatedBooking {
  id: string;
  serviceId: string;
  serviceName: string;
  staffId: string;
  staffName: string;
  startTime: string;
  endTime: string;
  status: string;
  depositPence: number;
  depositPaid: boolean;
  /**
   * Present only when a deposit is required (payments enabled). The frontend
   * passes this to Stripe.js to collect the card and confirm payment; the
   * booking stays 'pending' until Stripe's webhook confirms it.
   */
  clientSecret?: string;
}

/**
 * Create a booking, guarding against double-booking a technician.
 *
 * Flow:
 *   1. Load + validate the service and the requested slot (hours, lead time).
 *   2. Find qualified, active technicians (optionally the requested one).
 *   3. In a Serializable transaction, pick the first technician with no
 *      overlapping booking/time-off and insert the booking.
 *
 * Throws BookingError with an appropriate HTTP status on any failure.
 */
export async function createBooking(input: CreateBookingInput): Promise<CreatedBooking> {
  const service = await prisma.service.findUnique({ where: { id: input.serviceId } });
  if (!service || !service.active) {
    throw new BookingError(404, 'Service not found');
  }

  const start = input.startTime;
  const end = endTimeFor(start, service.durationMinutes);

  const weekday = start.getDay();
  const hours = await prisma.businessHours.findUnique({ where: { weekday } });

  const reason = validateSlot({
    start,
    end,
    openMin: hours?.openMin ?? null,
    closeMin: hours?.closeMin ?? null,
    now: new Date(),
    minLeadMinutes: config.minLeadMinutes,
  });
  if (reason) {
    throw new BookingError(400, reason);
  }

  // Which technicians can perform this service (and, if requested, is that one)?
  const qualified = await prisma.staffService.findMany({
    where: {
      serviceId: service.id,
      staff: { active: true },
      ...(input.staffId ? { staffId: input.staffId } : {}),
    },
    select: { staffId: true },
  });
  const candidateIds = qualified.map((q) => q.staffId);
  if (candidateIds.length === 0) {
    throw new BookingError(
      input.staffId ? 400 : 409,
      input.staffId
        ? 'That technician does not offer this service'
        : 'No technician is available for this service',
    );
  }

  // Serializable transaction: re-check availability and insert atomically so
  // two concurrent requests can't both claim the same technician + time.
  // (SQLite is single-writer, so this serialises; on Postgres, Serializable
  // gives the same guarantee. There is no exclusion constraint to lean on.)
  const created: CreatedBooking = await prisma.$transaction(
      async (tx) => {
        for (const staffId of candidateIds) {
          const [conflictingBooking, conflictingTimeOff] = await Promise.all([
            tx.booking.findFirst({
              where: {
                staffId,
                status: { in: ['pending', 'confirmed'] },
                startTime: { lt: end },
                endTime: { gt: start },
              },
              select: { id: true },
            }),
            tx.timeOff.findFirst({
              where: { staffId, startTime: { lt: end }, endTime: { gt: start } },
              select: { id: true },
            }),
          ]);
          if (conflictingBooking || conflictingTimeOff) continue;

          const staff = await tx.staff.findUnique({ where: { id: staffId }, select: { name: true } });
          // Guard against a race the WHERE clauses can't express directly.
          if (!staff) continue;

          const booking = await tx.booking.create({
            data: {
              serviceId: service.id,
              staffId,
              customerName: input.customerName,
              customerEmail: input.customerEmail,
              customerPhone: input.customerPhone,
              startTime: start,
              endTime: end,
              // With deposits on, the slot is held as 'pending' until Stripe's
              // webhook confirms payment; otherwise (free-first) it's confirmed
              // straight away. A 'pending' booking still blocks the slot from
              // other customers (see the overlap check above).
              status: config.paymentsEnabled ? 'pending' : 'confirmed',
            },
          });

          return {
            id: booking.id,
            serviceId: service.id,
            serviceName: service.name,
            staffId,
            staffName: staff.name,
            startTime: booking.startTime.toISOString(),
            endTime: booking.endTime.toISOString(),
            status: booking.status,
            depositPence: service.depositPence,
            depositPaid: booking.depositPaid,
          };
        }

        // Every candidate technician was busy for this slot.
        throw new BookingError(409, 'That time was just taken — please pick another slot');
      },
      { isolationLevel: 'Serializable' },
    );

  // Deposit step. Done AFTER the transaction commits so a Stripe network call
  // never runs while holding SQLite's write lock. If Stripe fails we roll the
  // booking back (releasing the slot) rather than leave a pending booking that
  // can never be paid.
  if (config.paymentsEnabled) {
    try {
      const intent = await createDepositIntent({
        bookingId: created.id,
        amountPence: created.depositPence,
        customerEmail: input.customerEmail,
        serviceName: created.serviceName,
      });
      await prisma.booking.update({
        where: { id: created.id },
        data: { stripePaymentIntentId: intent.paymentIntentId },
      });
      created.clientSecret = intent.clientSecret;
    } catch (err) {
      await prisma.booking.delete({ where: { id: created.id } }).catch(() => {
        /* best-effort rollback; ignore if already gone */
      });
      if (err instanceof BookingError) throw err;
      throw new BookingError(502, 'Could not start payment — please try again');
    }
  }

  return created;
}

/**
 * Guard the double-booking overlap logic against edge cases at the boundary.
 * Exposed for tests; mirrors the transaction's WHERE clause semantics.
 */
export function slotsConflict(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return overlaps(aStart, aEnd, bStart, bEnd);
}
