import { describe, it, expect } from 'vitest';
import { bookingUpdateForEvent } from './payments';

describe('bookingUpdateForEvent', () => {
  it('confirms the booking and marks the deposit paid on success', () => {
    expect(bookingUpdateForEvent('payment_intent.succeeded')).toEqual({
      status: 'confirmed',
      depositPaid: true,
    });
  });

  it('cancels the booking when the payment is canceled', () => {
    expect(bookingUpdateForEvent('payment_intent.canceled')).toEqual({
      status: 'cancelled',
      depositPaid: false,
    });
  });

  it('ignores a failed payment so the customer can retry (booking stays pending)', () => {
    expect(bookingUpdateForEvent('payment_intent.payment_failed')).toBeNull();
  });

  it('ignores unrelated event types', () => {
    expect(bookingUpdateForEvent('charge.refunded')).toBeNull();
    expect(bookingUpdateForEvent('customer.created')).toBeNull();
    expect(bookingUpdateForEvent('')).toBeNull();
  });
});
