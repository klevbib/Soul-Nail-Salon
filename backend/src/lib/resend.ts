// Lazy Resend (email) client.
//
// Free-first, mirroring lib/stripe.ts: email is an optional channel. `getResend()`
// returns null when no API key is configured, so callers can treat email as
// switched off without scattering env checks. The client is built once, on first
// use, and reused thereafter.

import { Resend } from 'resend';
import { config } from './config';

let client: Resend | null = null;

export function getResend(): Resend | null {
  if (!config.emailEnabled) return null;
  if (!client) {
    client = new Resend(config.resendApiKey);
  }
  return client;
}
