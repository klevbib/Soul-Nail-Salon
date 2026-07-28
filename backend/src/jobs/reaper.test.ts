import { describe, it, expect } from 'vitest';
import { stalePending, PendingCandidate } from './reaper';

const at = (iso: string): Date => new Date(iso);

describe('stalePending', () => {
  const now = at('2026-07-28T12:00:00Z');
  const holdMinutes = 30;

  const rows: PendingCandidate[] = [
    { id: 'old-pending', status: 'pending', createdAt: at('2026-07-28T11:00:00Z') }, // 60m old
    { id: 'fresh-pending', status: 'pending', createdAt: at('2026-07-28T11:45:00Z') }, // 15m old
    { id: 'just-at-cutoff', status: 'pending', createdAt: at('2026-07-28T11:30:00Z') }, // exactly 30m
    { id: 'confirmed', status: 'confirmed', createdAt: at('2026-07-28T09:00:00Z') },
    { id: 'cancelled', status: 'cancelled', createdAt: at('2026-07-28T09:00:00Z') },
  ];

  it('cancels only pending bookings older than the hold window', () => {
    const ids = stalePending(rows, now, holdMinutes).map((b) => b.id);
    expect(ids).toEqual(['old-pending']);
  });

  it('leaves a booking exactly at the cutoff (not yet strictly older)', () => {
    const ids = stalePending(rows, now, holdMinutes).map((b) => b.id);
    expect(ids).not.toContain('just-at-cutoff');
  });

  it('never touches confirmed/cancelled/completed bookings', () => {
    const ids = stalePending(rows, now, holdMinutes).map((b) => b.id);
    expect(ids).not.toContain('confirmed');
    expect(ids).not.toContain('cancelled');
  });

  it('returns nothing when hold window is longer than any booking age', () => {
    expect(stalePending(rows, now, 24 * 60)).toEqual([]);
  });
});
