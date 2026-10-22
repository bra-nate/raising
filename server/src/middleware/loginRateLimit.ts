import { Request, Response, NextFunction } from 'express';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_KEYS = 10_000;

type Attempt = { count: number; resetAt: number };
const attempts = new Map<string, Attempt>();

function clientKey(req: Request): string {
  const email = String(req.body?.email ?? '').trim().toLowerCase().slice(0, 254);
  // Vercel overwrites this header with the client IP, so callers cannot spoof it.
  const forwarded = req.get('x-vercel-forwarded-for');
  const network = forwarded?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  return `${network}:${email}`;
}

export function loginRateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const key = clientKey(req);
  const current = attempts.get(key);

  if (!current || current.resetAt <= now) {
    if (attempts.size >= MAX_KEYS) attempts.delete(attempts.keys().next().value!);
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }

  if (current.count >= MAX_ATTEMPTS) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  }

  current.count += 1;
  next();
}

export function resetLoginRateLimit(): void {
  attempts.clear();
}
