import bcrypt from 'bcrypt';
import { AppError } from './errors';

const MIN_LENGTH = 8;
const BCRYPT_ROUNDS = 12;

export function assertValidPassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) {
    throw new AppError(400, `Password must be at least ${MIN_LENGTH} characters`);
  }
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}
