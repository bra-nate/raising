import { Request, Response } from 'express';
import { config } from '../config';

export const SESSION_COOKIE = 'raising_session';

const cookieOptions = {
  httpOnly: true,
  secure: config.nodeEnv === 'production',
  sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
  path: '/',
} as const;

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    ...cookieOptions,
    maxAge: config.sessionMaxAgeMs,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
}

export function getSessionToken(req: Request): { token: string; fromCookie: boolean } | null {
  const cookie = req.headers.cookie
    ?.split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === SESSION_COOKIE);

  if (cookie?.[1]) {
    return { token: cookie.slice(1).join('='), fromCookie: true };
  }

  const authorization = req.headers.authorization;
  if (authorization?.startsWith('Bearer ')) {
    return { token: authorization.slice(7), fromCookie: false };
  }

  return null;
}

export function hasTrustedMutationOrigin(req: Request): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  return req.get('origin') === config.clientUrl;
}
