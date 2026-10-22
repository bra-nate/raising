import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { getSessionToken, hasTrustedMutationOrigin } from '../lib/authSession';

const PASSWORD_GATE_EXEMPT = [
  '/api/v1/auth/me',
  '/api/v1/auth/change-password',
  '/api/v1/auth/logout',
];

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const session = getSessionToken(req);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (session.fromCookie && !hasTrustedMutationOrigin(req)) {
    return res.status(403).json({ error: 'Invalid request origin', code: 'INVALID_ORIGIN' });
  }

  let payload;
  try {
    payload = verifyToken(session.token);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    // Authorization state is live, not frozen inside a seven-day token.
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, role: true, isActive: true, mustChangePassword: true },
    });
    if (!user?.isActive) return res.status(401).json({ error: 'Unauthorized' });

    req.user = {
      id: user.id,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };

    // A holder on a pastor-issued password reaches nothing but their own
    // profile and the change-password endpoint until they replace it.
    if (user.mustChangePassword && !PASSWORD_GATE_EXEMPT.includes(req.originalUrl.split('?')[0])) {
      return res.status(403).json({ error: 'Password change required', code: 'PASSWORD_CHANGE_REQUIRED' });
    }

    next();
  } catch (error) {
    next(error);
  }
}
