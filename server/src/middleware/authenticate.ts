import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt';

const PASSWORD_GATE_EXEMPT = [
  '/api/v1/auth/me',
  '/api/v1/auth/change-password',
  '/api/v1/auth/logout',
];

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = verifyToken(header.split(' ')[1]);
    req.user = payload; // { id: string, role: UserRole }

    // A holder on a pastor-issued password reaches nothing but their own
    // profile and the change-password endpoint until they replace it.
    if (payload.mustChangePassword && !PASSWORD_GATE_EXEMPT.includes(req.originalUrl.split('?')[0])) {
      return res.status(403).json({ error: 'Password change required', code: 'PASSWORD_CHANGE_REQUIRED' });
    }

    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
