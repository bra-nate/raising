/**
 * Password lifecycle: self-serve change and pastor-issued reset.
 * The operational rule is that a temporary password must be changeable,
 * a forgotten one recoverable, and neither path may bypass authentication.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { createUser } from '../test/fixtures';

const app = createApp();

function auth(user: { id: string; role: UserRole }) {
  return `Bearer ${signToken({ id: user.id, role: user.role })}`;
}

/** A user whose password hash is real, so bcrypt.compare is exercised. */
async function userWithPassword(password: string, role: UserRole = 'leader') {
  const user = await createUser({ role });
  return prisma.user.update({
    where: { id: user.id },
    data: { password: await bcrypt.hash(password, 4) },
  });
}

async function hashOf(id: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id } });
  return u.password;
}

describe('a user can change their own password', () => {
  it('replaces the hash and lets the new password log in', async () => {
    const user = await userWithPassword('old-password');

    await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', auth(user))
      .send({ currentPassword: 'old-password', newPassword: 'new-password' })
      .expect(200);

    expect(await bcrypt.compare('new-password', await hashOf(user.id))).toBe(true);

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'new-password' })
      .expect(200);
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'old-password' })
      .expect(401);
  });

  it('rejects a wrong current password and leaves the hash untouched', async () => {
    const user = await userWithPassword('old-password');
    const before = await hashOf(user.id);

    await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', auth(user))
      .send({ currentPassword: 'not-the-password', newPassword: 'new-password' })
      .expect(400);

    expect(await hashOf(user.id)).toBe(before);
  });

  it('rejects a new password under 8 characters', async () => {
    const user = await userWithPassword('old-password');
    await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', auth(user))
      .send({ currentPassword: 'old-password', newPassword: 'short' })
      .expect(400);
    expect(await bcrypt.compare('old-password', await hashOf(user.id))).toBe(true);
  });

  it('401s without a token', async () => {
    await request(app)
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: 'old-password', newPassword: 'new-password' })
      .expect(401);
  });
});

describe('a pastor can reset another user’s password', () => {
  it('sets a new password and records the actor in the activity log', async () => {
    const pastor = await createUser({ role: 'pastor' });
    const leader = await userWithPassword('forgotten-password');

    await request(app)
      .patch(`/api/v1/users/${leader.id}/password`)
      .set('Authorization', auth(pastor))
      .send({ newPassword: 'issued-password' })
      .expect(200);

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: leader.email, password: 'issued-password' })
      .expect(200);

    const log = await prisma.activityLog.findFirst({
      where: { action: 'reset_user_password', entityId: leader.id },
    });
    expect(log?.userId).toBe(pastor.id);
  });

  it('403s for a leader trying to reset anyone', async () => {
    const leaderA = await createUser({ role: 'leader' });
    const leaderB = await userWithPassword('leader-b-password');

    await request(app)
      .patch(`/api/v1/users/${leaderB.id}/password`)
      .set('Authorization', auth(leaderA))
      .send({ newPassword: 'hijacked-password' })
      .expect(403);

    expect(await bcrypt.compare('leader-b-password', await hashOf(leaderB.id))).toBe(true);
  });

  it('403s for a leader resetting their own password through the admin route', async () => {
    const leader = await userWithPassword('own-password');
    await request(app)
      .patch(`/api/v1/users/${leader.id}/password`)
      .set('Authorization', auth(leader))
      .send({ newPassword: 'bypass-password' })
      .expect(403);
  });
});
