import { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { assertValidPassword, hashPassword } from '../lib/password';
import { writeLog } from './activity-log.service';
import { notificationsService } from './notifications.service';

const PUBLIC_FIELDS = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

const VALID_ROLES: UserRole[] = ['superadmin', 'pastor', 'leader', 'followup_team_lead', 'followup_team_member'];

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
  assertValidPassword(password);

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) throw new AppError(409, 'A user with that email already exists');

  const hash = await hashPassword(password);

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

  // A role change is an audit-relevant event.
  if (data.role !== undefined && data.role !== target.role) {
    await writeLog({
      userId: actorId,
      action: 'changed_user_role',
      entityType: 'user',
      entityId: user.id,
      metadata: { field: 'role', from: target.role, to: data.role },
    });
    await notifyRoleChange(actorId, { id: user.id, fullName: user.fullName }, target.role, data.role);
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

/**
 * Role changes reach every pastor who did not make them.
 *
 * The case this exists for is a superadmin granting themselves pastoral access:
 * it is permitted, it is logged, and it must not be quiet. A log entry nobody
 * reads is not oversight.
 */
async function notifyRoleChange(
  actorId: string,
  target: { id: string; fullName: string },
  from: UserRole,
  to: UserRole
) {
  const [actor, pastors] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId }, select: { fullName: true } }),
    prisma.user.findMany({ where: { role: 'pastor', isActive: true } }),
  ]);

  const selfPromotion = actorId === target.id;
  const actorName = actor?.fullName ?? 'Someone';
  const title = selfPromotion ? 'A user changed their own role' : 'A user role changed';
  const message = selfPromotion
    ? `${actorName} changed their own role from ${from} to ${to}.`
    : `${actorName} changed ${target.fullName} from ${from} to ${to}.`;

  for (const pastor of pastors) {
    // Don't tell a pastor about their own action.
    if (pastor.id === actorId) continue;
    await notificationsService.createNotification({
      userId: pastor.id,
      type: 'role_changed',
      title,
      message,
      entityType: 'user',
      entityId: target.id,
    });
    await notificationsService.sendEmail(pastor.email, title, `<p>${message}</p>`);
  }
}

// Pastor-issued reset: no current password, so the actor is always recorded.
async function resetPassword(actorId: string, id: string, newPassword: string) {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new AppError(404, 'User not found');

  assertValidPassword(newPassword);

  await prisma.user.update({
    where: { id },
    data: { password: await hashPassword(newPassword) },
  });

  await writeLog({
    userId: actorId,
    action: 'reset_user_password',
    entityType: 'user',
    entityId: id,
    metadata: { email: target.email },
  });
}

export const usersService = { listUsers, createUser, updateUser, deactivateUser, resetPassword };
