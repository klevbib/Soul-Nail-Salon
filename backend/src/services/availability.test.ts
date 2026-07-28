import { describe, it, expect } from 'vitest';
import { computeSlots, overlaps, type Interval } from './availability';

// A fixed reference day far in the past-free future to keep tests deterministic.
// 2999-06-04 is a Wednesday.
const DAY = new Date(2999, 5, 4);
// A "now" long before the day so the min-lead filter never trims slots.
const NOW = new Date(2999, 5, 1, 0, 0, 0);

function at(h: number, m: number): Date {
  return new Date(2999, 5, 4, h, m, 0, 0);
}

describe('overlaps', () => {
  it('detects overlapping intervals', () => {
    expect(overlaps(at(10, 0), at(11, 0), at(10, 30), at(11, 30))).toBe(true);
  });
  it('treats touching edges as non-overlapping', () => {
    expect(overlaps(at(10, 0), at(11, 0), at(11, 0), at(12, 0))).toBe(false);
  });
  it('detects disjoint intervals as non-overlapping', () => {
    expect(overlaps(at(10, 0), at(11, 0), at(12, 0), at(13, 0))).toBe(false);
  });
});

describe('computeSlots', () => {
  const base = {
    date: DAY,
    durationMinutes: 60,
    openMin: 9 * 60 + 30, // 09:30
    closeMin: 18 * 60 + 30, // 18:30
    busy: [] as Interval[],
    now: NOW,
    granularityMinutes: 30,
    minLeadMinutes: 0,
  };

  it('returns no slots on a closed day (null hours)', () => {
    expect(computeSlots({ ...base, openMin: null, closeMin: null })).toEqual([]);
  });

  it('generates slots at the given granularity within open hours', () => {
    const slots = computeSlots(base);
    // First slot at 09:30, last start no later than 17:30 (so a 60m service ends by 18:30).
    expect(slots[0].getHours()).toBe(9);
    expect(slots[0].getMinutes()).toBe(30);
    const last = slots[slots.length - 1];
    expect(last.getHours()).toBe(17);
    expect(last.getMinutes()).toBe(30);
  });

  it('never lets a service run past closing time', () => {
    // 90-minute service: last start must be 17:00 (ends 18:30).
    const slots = computeSlots({ ...base, durationMinutes: 90 });
    const last = slots[slots.length - 1];
    expect(last.getHours()).toBe(17);
    expect(last.getMinutes()).toBe(0);
  });

  it('excludes slots that collide with a busy interval', () => {
    // Busy 10:00–11:00 should remove the 09:30, 10:00, 10:30 starts
    // (each of those 60m slots overlaps the busy block).
    const slots = computeSlots({
      ...base,
      busy: [{ start: at(10, 0), end: at(11, 0) }],
    });
    const times = slots.map((s) => `${s.getHours()}:${s.getMinutes()}`);
    expect(times).not.toContain('9:30');
    expect(times).not.toContain('10:0');
    expect(times).not.toContain('10:30');
    // 11:00 start (11:00–12:00) is clear again.
    expect(times).toContain('11:0');
  });

  it('drops slots earlier than now + minLeadMinutes', () => {
    // "now" is 11:00 on the booking day, lead 60m => earliest bookable start 12:00.
    const slots = computeSlots({
      ...base,
      now: at(11, 0),
      minLeadMinutes: 60,
    });
    expect(slots[0].getHours()).toBe(12);
    expect(slots[0].getMinutes()).toBe(0);
  });
});
