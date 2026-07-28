import { describe, it, expect } from 'vitest';
import { remindersDue, type ReminderCandidate } from './reminders';

const NOW = new Date('2026-08-03T09:00:00Z');
const HOUR = 3_600_000;

function booking(over: Partial<ReminderCandidate>): ReminderCandidate {
  return {
    id: 'b',
    status: 'confirmed',
    startTime: new Date(NOW.getTime() + 6 * HOUR), // within a 24h window by default
    reminderSentAt: null,
    ...over,
  };
}

describe('remindersDue', () => {
  it('includes a confirmed, un-reminded booking inside the window', () => {
    const due = remindersDue([booking({ id: 'in' })], NOW, 24);
    expect(due.map((b) => b.id)).toEqual(['in']);
  });

  it('excludes bookings starting beyond the lead window', () => {
    const far = booking({ id: 'far', startTime: new Date(NOW.getTime() + 30 * HOUR) });
    expect(remindersDue([far], NOW, 24)).toEqual([]);
  });

  it('excludes bookings already in the past', () => {
    const past = booking({ id: 'past', startTime: new Date(NOW.getTime() - HOUR) });
    expect(remindersDue([past], NOW, 24)).toEqual([]);
  });

  it('excludes bookings already reminded', () => {
    const done = booking({ id: 'done', reminderSentAt: new Date(NOW.getTime() - 2 * HOUR) });
    expect(remindersDue([done], NOW, 24)).toEqual([]);
  });

  it('excludes non-confirmed bookings (pending/cancelled)', () => {
    const pending = booking({ id: 'pending', status: 'pending' });
    const cancelled = booking({ id: 'cancelled', status: 'cancelled' });
    expect(remindersDue([pending, cancelled], NOW, 24)).toEqual([]);
  });

  it('includes a booking exactly at the window edge but not one just past it', () => {
    const edge = booking({ id: 'edge', startTime: new Date(NOW.getTime() + 24 * HOUR) });
    const over = booking({ id: 'over', startTime: new Date(NOW.getTime() + 24 * HOUR + 1) });
    expect(remindersDue([edge, over], NOW, 24).map((b) => b.id)).toEqual(['edge']);
  });
});
