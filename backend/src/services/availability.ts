// Availability engine.
//
// The core slot computation is a **pure function** (`computeSlots`) with no
// database or clock access, so it is easy to unit-test. `getAvailability` is a
// thin wrapper that loads the service, business hours, staff and existing
// bookings/time-off from the database and feeds them into `computeSlots`.
//
// All times are handled in the server's local timezone. The salon is UK-based;
// when deploying, run the server in Europe/London (or set TZ) so slot times
// line up with the salon's clock.

import { prisma } from '../lib/prisma';
import { config } from '../lib/config';

export interface Interval {
  start: Date;
  end: Date;
}

/** True when [aStart, aEnd) and [bStart, bEnd) overlap. Touching edges do not. */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export interface SlotParams {
  /** The day to compute slots for; only year/month/day are used. */
  date: Date;
  durationMinutes: number;
  /** Minutes from midnight the salon opens/closes that weekday; null = closed. */
  openMin: number | null;
  closeMin: number | null;
  /** Busy intervals (existing bookings + time-off) to exclude. */
  busy: Interval[];
  /** Reference "current time" used to drop past / too-soon slots. */
  now: Date;
  granularityMinutes?: number;
  minLeadMinutes?: number;
}

/**
 * Generate bookable start times for a single resource (one technician, or a
 * pre-merged busy set). Returns Date objects for each free slot start.
 */
export function computeSlots(p: SlotParams): Date[] {
  const gran = p.granularityMinutes ?? 15;
  const lead = p.minLeadMinutes ?? 0;

  if (p.openMin == null || p.closeMin == null) return [];

  const dayStart = new Date(
    p.date.getFullYear(),
    p.date.getMonth(),
    p.date.getDate(),
    0, 0, 0, 0,
  );
  const earliest = new Date(p.now.getTime() + lead * 60_000);

  const slots: Date[] = [];
  for (let m = p.openMin; m + p.durationMinutes <= p.closeMin; m += gran) {
    const start = new Date(dayStart.getTime() + m * 60_000);
    const end = new Date(start.getTime() + p.durationMinutes * 60_000);
    if (start < earliest) continue;
    const conflict = p.busy.some((b) => overlaps(start, end, b.start, b.end));
    if (!conflict) slots.push(start);
  }
  return slots;
}

export interface AvailabilityQuery {
  serviceId: string;
  /** Optional: restrict to one technician. Omitted => any technician. */
  staffId?: string;
  /** The day to compute availability for (local date). */
  date: Date;
}

export interface AvailabilityResult {
  /** ISO-ish local "HH:MM" start times available that day. */
  slots: string[];
  /** Full ISO datetimes, aligned by index with `slots`. */
  slotsIso: string[];
}

export class AvailabilityError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Compute availability for a service on a given day, optionally for a specific
 * technician. When no technician is specified, a slot is offered if *any*
 * qualified, active technician is free for it (union across staff).
 */
export async function getAvailability(q: AvailabilityQuery): Promise<AvailabilityResult> {
  const service = await prisma.service.findUnique({ where: { id: q.serviceId } });
  if (!service || !service.active) {
    throw new AvailabilityError(404, 'Service not found');
  }

  const weekday = q.date.getDay();
  const hours = await prisma.businessHours.findUnique({ where: { weekday } });
  if (!hours || hours.openMin == null || hours.closeMin == null) {
    return { slots: [], slotsIso: [] };
  }

  // Which technicians can perform this service?
  const qualified = await prisma.staffService.findMany({
    where: {
      serviceId: service.id,
      staff: { active: true },
      ...(q.staffId ? { staffId: q.staffId } : {}),
    },
    select: { staffId: true },
  });
  const staffIds = qualified.map((s) => s.staffId);
  if (staffIds.length === 0) {
    // Either the staff member doesn't perform this service, or none do.
    return { slots: [], slotsIso: [] };
  }

  // Load busy intervals (bookings + time-off) for these staff on this day.
  const dayStart = new Date(q.date.getFullYear(), q.date.getMonth(), q.date.getDate(), 0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);

  const [bookings, timeOff] = await Promise.all([
    prisma.booking.findMany({
      where: {
        staffId: { in: staffIds },
        status: { in: ['pending', 'confirmed'] },
        startTime: { lt: dayEnd },
        endTime: { gt: dayStart },
      },
      select: { staffId: true, startTime: true, endTime: true },
    }),
    prisma.timeOff.findMany({
      where: {
        staffId: { in: staffIds },
        startTime: { lt: dayEnd },
        endTime: { gt: dayStart },
      },
      select: { staffId: true, startTime: true, endTime: true },
    }),
  ]);

  // Group busy intervals per staff member.
  const busyByStaff = new Map<string, Interval[]>();
  for (const id of staffIds) busyByStaff.set(id, []);
  for (const b of [...bookings, ...timeOff]) {
    busyByStaff.get(b.staffId)!.push({ start: b.startTime, end: b.endTime });
  }

  const now = new Date();
  // A slot is available if at least one qualified staff member is free for it.
  // Compute each staff member's free slots, then union the start times.
  const availableIso = new Set<string>();
  for (const id of staffIds) {
    const slots = computeSlots({
      date: q.date,
      durationMinutes: service.durationMinutes,
      openMin: hours.openMin,
      closeMin: hours.closeMin,
      busy: busyByStaff.get(id)!,
      now,
      granularityMinutes: config.slotGranularityMinutes,
      minLeadMinutes: config.minLeadMinutes,
    });
    for (const s of slots) availableIso.add(s.toISOString());
  }

  const sorted = [...availableIso].map((iso) => new Date(iso)).sort((a, b) => a.getTime() - b.getTime());
  return {
    slots: sorted.map(hhmm),
    slotsIso: sorted.map((d) => d.toISOString()),
  };
}
