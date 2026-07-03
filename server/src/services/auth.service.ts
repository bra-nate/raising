import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { AppError } from '../lib/errors';
import { writeLog } from './activity-log.service';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

export interface LoginResult {
  token: string;
  user: AuthUser;
}

async function login(email: string, password: string): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { email } });

  // Generic error — do not distinguish wrong email vs wrong password,
  // and treat deactivated accounts the same way.
  const genericFailure = new AppError(401, 'Invalid email or password');

  if (!user || !user.isActive) {
    // Still run a hash comparison to reduce timing side-channels.
    await bcrypt.compare(password, '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinv');
    throw genericFailure;
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) throw genericFailure;

  const token = signToken({ id: user.id, role: user.role });
  await writeLog({
    userId: user.id,
    action: 'logged_in',
    entityType: 'user',
    entityId: user.id,
  });
  return {
    token,
    user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role },
  };
}

async function getProfile(userId: string): Promise<AuthUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) throw new AppError(401, 'Unauthorized');
  return { id: user.id, fullName: user.fullName, email: user.email, role: user.role };
}

export const authService = { login, getProfile };
