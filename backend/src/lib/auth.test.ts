import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  parseCookies,
} from './auth';

describe('password hashing', () => {
  it('verifies the correct password', () => {
    const stored = hashPassword('correct horse battery staple');
    expect(verifyPassword('correct horse battery staple', stored)).toBe(true);
  });

  it('rejects the wrong password', () => {
    const stored = hashPassword('s3cret');
    expect(verifyPassword('S3cret', stored)).toBe(false);
    expect(verifyPassword('', stored)).toBe(false);
    expect(verifyPassword('s3cret ', stored)).toBe(false);
  });

  it('uses a random salt so the same password hashes differently', () => {
    expect(hashPassword('same')).not.toEqual(hashPassword('same'));
  });

  it('returns false (never throws) on malformed stored hashes', () => {
    expect(verifyPassword('pw', '')).toBe(false);
    expect(verifyPassword('pw', 'not-a-hash')).toBe(false);
    expect(verifyPassword('pw', 'scrypt$16384$8$1$xyz')).toBe(false); // too few parts
    expect(verifyPassword('pw', 'bcrypt$16384$8$1$aa$bb')).toBe(false); // wrong algo
    expect(verifyPassword('pw', 'scrypt$x$8$1$aa$bb')).toBe(false); // bad N
  });
});

describe('session tokens', () => {
  const secret = 'test-session-secret';
  const now = new Date('2026-07-28T12:00:00Z');

  it('accepts a fresh token before expiry', () => {
    const token = createSessionToken(secret, now, 60_000);
    const later = new Date(now.getTime() + 30_000);
    expect(verifySessionToken(token, secret, later)).toBe(true);
  });

  it('rejects an expired token', () => {
    const token = createSessionToken(secret, now, 60_000);
    const later = new Date(now.getTime() + 60_001);
    expect(verifySessionToken(token, secret, later)).toBe(false);
  });

  it('rejects a token signed with a different secret', () => {
    const token = createSessionToken(secret, now, 60_000);
    expect(verifySessionToken(token, 'other-secret', now)).toBe(false);
  });

  it('rejects a tampered expiry', () => {
    const token = createSessionToken(secret, now, 60_000);
    const [, sig] = token.split('.');
    const forged = `${now.getTime() + 10_000_000}.${sig}`;
    expect(verifySessionToken(forged, secret, now)).toBe(false);
  });

  it('rejects malformed tokens', () => {
    expect(verifySessionToken('', secret, now)).toBe(false);
    expect(verifySessionToken('no-dot', secret, now)).toBe(false);
    expect(verifySessionToken('.sig', secret, now)).toBe(false);
    expect(verifySessionToken('abc.sig', secret, now)).toBe(false);
  });
});

describe('parseCookies', () => {
  it('parses a normal cookie header', () => {
    expect(parseCookies('admin_session=abc.def; other=1')).toEqual({
      admin_session: 'abc.def',
      other: '1',
    });
  });

  it('url-decodes values and handles empties', () => {
    expect(parseCookies('a=one%20two')).toEqual({ a: 'one two' });
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('')).toEqual({});
    expect(parseCookies('=novalue; valid=x')).toEqual({ valid: 'x' });
  });
});
