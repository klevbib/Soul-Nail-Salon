import { describe, it, expect } from 'vitest';
import { validateSlot, endTimeFor, slotsConflict } from './booking';

// Tue–Sat opening hours used by the salon: 09:30–18:30.
const OPEN = 9 * 60 + 30;
const CLOSE = 18 * 60 + 30;

// A fixed booking day far in the future so the lead-time filter is predictable.
// 2999-06-04 is a Wednesday (an open day).
function at(h: number, m: number): Date {
  return new Date(2999, 5, 4, h, m, 0, 0);
}
// A "now" long before the booking day so lead time never trims a valid slot.
const NOW = new Date(2999, 5, 1, 0, 0, 0);

describe('endTimeFor', () => {
  it('adds the service duration in minutes', () => {
    expect(endTimeFor(at(10, 0), 45)).toEqual(at(10, 45));
  });
});

describe('validateSlot', () => {
  const base = {
    start: at(10, 0),
    end: at(11, 0),
    openMin: OPEN,
    closeMin: CLOSE,
    now: NOW,
    minLeadMinutes: 60,
  };

  it('accepts a slot fully inside opening hours', () => {
    expect(validateSlot(base)).toBeNull();
  });

  it('rejects a closed day (null hours)', () => {
    expect(validateSlot({ ...base, openMin: null, closeMin: null })).toMatch(/closed/i);
  });

  it('rejects a start before opening time', () => {
    expect(validateSlot({ ...base, start: at(9, 0), end: at(10, 0) })).toMatch(/opening hours/i);
  });

  it('rejects a service that would run past closing time', () => {
    // Starts before close but ends after it.
    expect(validateSlot({ ...base, start: at(18, 0), end: at(19, 0) })).toMatch(/opening hours/i);
  });

  it('accepts a slot that ends exactly at closing time', () => {
    expect(validateSlot({ ...base, start: at(17, 30), end: at(18, 30) })).toBeNull();
  });

  it('rejects a slot earlier than now + lead time', () => {
    // now is 10:00 on the booking day, lead 60m => earliest start 11:00.
    const reason = validateSlot({ ...base, now: at(10, 0), start: at(10, 30), end: at(11, 30) });
    expect(reason).toMatch(/too soon|past/i);
  });

  it('rejects a start in the past', () => {
    const reason = validateSlot({ ...base, now: at(12, 0), start: at(10, 0), end: at(11, 0) });
    expect(reason).toMatch(/too soon|past/i);
  });
});

describe('slotsConflict (double-booking guard)', () => {
  it('flags overlapping appointments', () => {
    expect(slotsConflict(at(10, 0), at(11, 0), at(10, 30), at(11, 30))).toBe(true);
  });
  it('allows back-to-back appointments (touching edges)', () => {
    expect(slotsConflict(at(10, 0), at(11, 0), at(11, 0), at(12, 0))).toBe(false);
  });
  it('allows appointments on either side that do not touch', () => {
    expect(slotsConflict(at(10, 0), at(11, 0), at(12, 0), at(13, 0))).toBe(false);
  });
});
