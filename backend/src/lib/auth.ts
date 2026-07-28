// Admin authentication primitives.
//
// Phase 5 secures the admin dashboard with a single shared password (no user
// accounts at MVP), but does it the safe way:
//   * The password is never stored in plaintext — the server holds only a
//     scrypt hash (see `hashPassword` / `verifyPassword`). Generate the hash
//     with `npm run admin:hash` and put it in ADMIN_PASSWORD_HASH.
//   * On login the server issues a short-lived, HMAC-signed session token that
//     is set as an HttpOnly + SameSite=Strict cookie (see routes/admin.ts), so
//     an XSS bug can't read it and it can't be replayed cross-site.
//   * All comparisons are constant-time (`crypto.timingSafeEqual`) to avoid
//     leaking secrets through timing.
//
// Everything here is pure (no DB, no clock of its own — `now` is passed in) so
// it is straightforward to unit-test.

import {
  scryptSync,
  randomBytes,
  createHmac,
  timingSafeEqual,
} from 'crypto';

// scrypt cost parameters. N must be a power of two; these are a sensible
// interactive-login default (~tens of ms) and are recorded in the hash string
// so a future change doesn't invalidate existing hashes.
const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;

/**
 * Hash a password for storage in ADMIN_PASSWORD_HASH.
 * Format: `scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>` — self-describing so
 * `verifyPassword` can reproduce the derivation without external config.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LEN);
  const hash = scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
  });
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_r,
    SCRYPT_p,
    salt.toString('hex'),
    hash.toString('hex'),
  ].join('$');
}

/**
 * Verify a candidate password against a stored `scrypt$...` hash.
 * Returns false (never throws) on any malformed input. Constant-time on the
 * hash comparison.
 */
export function verifyPassword(password: string, stored: string): boolean {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], 'hex');
    expected = Buffer.from(parts[5], 'hex');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  let actual: Buffer;
  try {
    actual = scryptSync(password, salt, expected.length, { N, r, p });
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Mint a session token: `<expiryMs>.<hmacHex>`, where the HMAC signs the
 * expiry with the server's SESSION_SECRET. Stateless — no server-side session
 * store — so logout is cookie-clearing and a leaked secret rotates all tokens.
 */
export function createSessionToken(
  secret: string,
  now: Date,
  ttlMs: number,
): string {
  const exp = now.getTime() + ttlMs;
  const sig = signPayload(secret, String(exp));
  return `${exp}.${sig}`;
}

/**
 * Validate a session token: correct signature (constant-time) AND not expired.
 * Returns false for any malformed/expired/tampered token.
 */
export function verifySessionToken(
  token: string,
  secret: string,
  now: Date,
): boolean {
  if (!token || !secret) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;

  const expPart = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const exp = Number(expPart);
  if (!Number.isInteger(exp)) return false;

  const expected = signPayload(secret, expPart);
  if (!constantTimeStringEq(sig, expected)) return false;

  return now.getTime() < exp;
}

function signPayload(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Constant-time string comparison that tolerates unequal lengths. */
function constantTimeStringEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Parse a Cookie header into a name→value map. We parse by hand rather than add
 * a cookie-parser dependency — the admin flow needs exactly one cookie.
 */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    const value = part.slice(eq + 1).trim();
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}
