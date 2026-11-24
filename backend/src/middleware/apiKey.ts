import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Staff access: every /api request must carry the shared staff key in an X-API-Key header.
 * The key is compared in constant time so the check cannot be used to guess it one character at a time.
 *
 * This is a deliberately small gate for a single-hospital deployment, not a user system: everyone who has the key can
 * do everything. Real per-person accounts and roles would replace this.
 */
export function requireApiKey(expectedKey: string) {
  const expected = Buffer.from(expectedKey);
  return (req: Request, res: Response, next: NextFunction) => {
    const sent = req.header('x-api-key');
    const given = Buffer.from(typeof sent === 'string' ? sent : '');
    const ok = given.length === expected.length && timingSafeEqual(given, expected);
    if (!ok) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'A valid staff key is needed to use this system.' } });
      return;
    }
    next();
  };
}
