import bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { writeLog } from './activity-log.service';

const PUBLIC_FIELDS = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

const VALID_ROLES: UserRole[] = ['pastor', 'leader', 'followup_team_lead', 'followup_team_member'];

async function listUsers() {
  const data = await prisma.user.findMany({
    select: PUBLIC_FIELDS,
    orderBy: { createdAt: 'desc' },
  });
  return { data, total: data.length };
}

interface CreateUserInput {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
}

async function createUser(actorId: string, input: CreateUserInput) {
  const { fullName, email, password, role } = input;

  if (!fullName?.trim() || !email?.trim() || !password || !role) {
    throw new AppError(400, 'fullName, email, password and role are required');
  }
  if (!VALID_ROLES.includes(role)) {
    throw new AppError(400, 'Invalid role');
  }
  if (password.length < 8) {
    throw new AppError(400, 'Password must be at least 8 characters');
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) throw new AppError(409, 'A user with that email already exists');

  const hash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { fullName: fullName.trim(), email: email.toLowerCase(), password: hash, role },
    select: PUBLIC_FIELDS,
  });

  await writeLog({
    userId: actorId,
    action: 'created_user',
    entityType: 'user',
    entityId: user.id,
    metadata: { email: user.email, role: user.role },
  });

  return user;
}

interface UpdateUserInput {
  fullName?: string;
  role?: UserRole;
}

async function updateUser(actorId: string, id: string, input: UpdateUserInput) {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new AppError(404, 'User not found');

  const data: { fullName?: string; role?: UserRole } = {};
  if (input.fullName !== undefined) {
    if (!input.fullName.trim()) throw new AppError(400, 'fullName cannot be empty');
    data.fullName = input.fullName.trim();
  }
  if (input.role !== undefined) {
    if (!VALID_ROLES.includes(input.role)) throw new AppError(400, 'Invalid role');
    data.role = input.role;
  }
  if (Object.keys(data).length === 0) {
    throw new AppError(400, 'Nothing to update');
  }

  const user = await prisma.user.update({ where: { id }, data, select: PUBLIC_FIELDS });

  // A role change is an audit-relevant settings-style event.
  if (data.role !== undefined && data.role !== target.role) {
    await writeLog({
      userId: actorId,
      action: 'updated_settings',
      entityType: 'user',
      entityId: user.id,
      metadata: { field: 'role', from: target.role, to: data.role },
    });
  }

  return user;
}

async function deactivateUser(actorId: string, id: string) {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new AppError(404, 'User not found');
  if (target.id === actorId) throw new AppError(400, 'You cannot deactivate your own account');

  const user = await prisma.user.update({
    where: { id },
    data: { isActive: false },
    select: PUBLIC_FIELDS,
  });

  await writeLog({
    userId: actorId,
    action: 'deactivated_user',
    entityType: 'user',
    entityId: user.id,
    metadata: { email: user.email },
  });

  return user;
}

export const usersService = { listUsers, createUser, updateUser, deactivateUser };
