// Lazy Twilio (SMS) client.
//
// Free-first, mirroring lib/stripe.ts: SMS is an optional channel. `getTwilio()`
// returns null unless the account SID, auth token AND a from-number are all set,
// so callers can treat SMS as switched off without env checks. Built once, on
// first use, and reused.

import twilio, { Twilio } from 'twilio';
import { config } from './config';

let client: Twilio | null = null;

export function getTwilio(): Twilio | null {
  if (!config.smsEnabled) return null;
  if (!client) {
    client = twilio(config.twilioAccountSid, config.twilioAuthToken);
  }
  return client;
}
