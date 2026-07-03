import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt';

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload = verifyToken(header.split(' ')[1]);
    req.user = payload; // { id: string, role: UserRole }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
