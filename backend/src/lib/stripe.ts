// Lazy Stripe client.
//
// Free-first: payments are an optional feature. `getStripe()` returns null when
// no secret key is configured, so callers can treat deposits as switched off
// without sprinkling env checks everywhere. The client is constructed once, on
// first use, and reused thereafter.

import Stripe from 'stripe';
import { config } from './config';

let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!config.paymentsEnabled) return null;
  if (!client) {
    // apiVersion omitted on purpose: use the account's default pinned version.
    client = new Stripe(config.stripeSecretKey);
  }
  return client;
}
