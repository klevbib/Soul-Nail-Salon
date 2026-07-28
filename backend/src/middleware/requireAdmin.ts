// Gate for the admin API.
//
// Fails CLOSED: if the dashboard isn't configured (no password hash / session
// secret) every protected route returns 503, never open access. Otherwise it
// requires a valid, unexpired session cookie — the one login sets.

import type { Request, Response, NextFunction } from 'express';
import { config } from '../lib/config';
import { parseCookies, verifySessionToken } from '../lib/auth';

/** Name of the session cookie set on login (see routes/admin.ts). */
export const SESSION_COOKIE = 'admin_session';

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!config.adminEnabled) {
    res.status(503).json({ error: 'Admin dashboard is not configured' });
    return;
  }

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (!token || !verifySessionToken(token, config.sessionSecret, new Date())) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  next();
}
