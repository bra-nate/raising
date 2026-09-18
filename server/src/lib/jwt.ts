import jwt, { SignOptions } from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { config } from '../config';

export interface JwtPayload {
  id: string;
  role: UserRole;
  /** True while the holder is on a pastor-issued password and must replace it. */
  mustChangePassword?: boolean;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  } as SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
  return { id: decoded.id, role: decoded.role, mustChangePassword: !!decoded.mustChangePassword };
}
