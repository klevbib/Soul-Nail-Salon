// Stripe deposit payments (Phase 3).
//
// Two concerns live here:
//   * `createDepositIntent` — a side-effecting call that asks Stripe to create a
//     PaymentIntent for a booking's deposit and hands back the client secret the
//     browser needs to collect card details.
//   * `bookingUpdateForEvent` — a pure mapping from an incoming Stripe webhook
//     event type to the booking-state change it implies. Kept pure so it can be
//     unit-tested without Stripe or a database.

import { getStripe } from '../lib/stripe';

export interface DepositIntent {
  paymentIntentId: string;
  clientSecret: string;
}

export interface CreateDepositIntentParams {
  bookingId: string;
  amountPence: number;
  customerEmail: string;
  serviceName: string;
}

/**
 * Create a Stripe PaymentIntent for a booking's deposit.
 *
 * `bookingId` is stored in the intent's metadata so the webhook can map a
 * payment back to its booking. Throws if payments are disabled (callers should
 * check `config.paymentsEnabled` first) or if Stripe returns no client secret.
 */
export async function createDepositIntent(
  params: CreateDepositIntentParams,
): Promise<DepositIntent> {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error('createDepositIntent called while payments are disabled');
  }

  const intent = await stripe.paymentIntents.create({
    amount: params.amountPence,
    currency: 'gbp',
    receipt_email: params.customerEmail,
    description: `Deposit — ${params.serviceName}`,
    metadata: { bookingId: params.bookingId },
    automatic_payment_methods: { enabled: true },
  });

  if (!intent.client_secret) {
    throw new Error('Stripe did not return a client secret for the PaymentIntent');
  }
  return { paymentIntentId: intent.id, clientSecret: intent.client_secret };
}

export interface BookingStateChange {
  status: string;
  depositPaid: boolean;
}

/**
 * The booking-state change implied by a Stripe webhook event, or null if the
 * event is one we don't act on.
 *
 *   payment_intent.succeeded → deposit taken, confirm the booking
 *   payment_intent.canceled  → payment abandoned, release the booking
 *
 * `payment_intent.payment_failed` is intentionally a no-op: the booking stays
 * pending so the customer can retry the card without losing their slot.
 */
export function bookingUpdateForEvent(eventType: string): BookingStateChange | null {
  switch (eventType) {
    case 'payment_intent.succeeded':
      return { status: 'confirmed', depositPaid: true };
    case 'payment_intent.canceled':
      return { status: 'cancelled', depositPaid: false };
    default:
      return null;
  }
}
