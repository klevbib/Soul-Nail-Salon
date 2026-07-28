import { describe, it, expect } from 'vitest';
import { nextStatusForAction } from './admin';

describe('nextStatusForAction', () => {
  it('cancels a pending or confirmed booking', () => {
    expect(nextStatusForAction('pending', 'cancel')).toEqual({ status: 'cancelled' });
    expect(nextStatusForAction('confirmed', 'cancel')).toEqual({ status: 'cancelled' });
  });

  it('completes only a confirmed booking', () => {
    expect(nextStatusForAction('confirmed', 'complete')).toEqual({ status: 'completed' });
  });

  it('will not complete a pending booking (deposit not cleared)', () => {
    const r = nextStatusForAction('pending', 'complete');
    expect(r.status).toBeUndefined();
    expect(r.error).toMatch(/pending/);
  });

  it('treats cancelled and completed as terminal', () => {
    expect(nextStatusForAction('cancelled', 'cancel').error).toMatch(/already cancelled/);
    expect(nextStatusForAction('cancelled', 'complete').error).toMatch(/already cancelled/);
    expect(nextStatusForAction('completed', 'cancel').error).toMatch(/already completed/);
    expect(nextStatusForAction('completed', 'complete').error).toMatch(/already completed/);
  });
});
