import { describe, it, expect } from 'vitest';
import { createRateLimiter } from './rateLimit';

describe('createRateLimiter', () => {
  it('allows up to max hits then blocks within the window', () => {
    const rl = createRateLimiter(3, 60_000);
    const now = new Date('2026-07-28T12:00:00Z');
    expect(rl.hit('ip', now).allowed).toBe(true);
    expect(rl.hit('ip', now).allowed).toBe(true);
    expect(rl.hit('ip', now).allowed).toBe(true);
    const blocked = rl.hit('ip', now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(60_000);
  });

  it('resets after the window elapses', () => {
    const rl = createRateLimiter(1, 60_000);
    const now = new Date('2026-07-28T12:00:00Z');
    expect(rl.hit('ip', now).allowed).toBe(true);
    expect(rl.hit('ip', now).allowed).toBe(false);
    const later = new Date(now.getTime() + 60_000);
    expect(rl.hit('ip', later).allowed).toBe(true);
  });

  it('tracks keys independently', () => {
    const rl = createRateLimiter(1, 60_000);
    const now = new Date('2026-07-28T12:00:00Z');
    expect(rl.hit('a', now).allowed).toBe(true);
    expect(rl.hit('b', now).allowed).toBe(true);
    expect(rl.hit('a', now).allowed).toBe(false);
  });
});
