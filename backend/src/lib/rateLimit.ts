// Tiny in-memory fixed-window rate limiter.
//
// Used to throttle admin login attempts (brute-force defence). It's per-process
// and non-distributed — fine for the single-instance MVP; a multi-instance
// deploy would move this to Redis. Kept pure-ish: the clock is injected so the
// window logic is unit-testable.

interface Window {
  count: number;
  resetAt: number; // epoch ms when the current window ends
}

export interface RateLimiter {
  /**
   * Record a hit for `key` at time `now`. Returns whether the caller is still
   * within budget (true = allowed) and how long until the window resets.
   */
  hit(key: string, now: Date): { allowed: boolean; retryAfterMs: number };
}

/**
 * Create a limiter allowing `max` hits per `windowMs` per key.
 * Old windows are lazily replaced on the next hit, so memory stays bounded by
 * the set of recently-seen keys.
 */
export function createRateLimiter(max: number, windowMs: number): RateLimiter {
  const windows = new Map<string, Window>();

  return {
    hit(key, now) {
      const t = now.getTime();
      const existing = windows.get(key);

      if (!existing || t >= existing.resetAt) {
        windows.set(key, { count: 1, resetAt: t + windowMs });
        return { allowed: true, retryAfterMs: 0 };
      }

      existing.count += 1;
      if (existing.count > max) {
        return { allowed: false, retryAfterMs: existing.resetAt - t };
      }
      return { allowed: true, retryAfterMs: 0 };
    },
  };
}
