import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { hashPassword } from '../lib/password';
import { createUser, seedSettings } from './fixtures';

const app = createApp();

describe('forced password change', () => {
  it('blocks every route but the way out, and login says so', async () => {
    const password = 'temporary-123';
    const user = await createUser({ role: 'leader' });
    await prisma.user.update({
      where: { id: user.id },
      data: { password: await hashPassword(password), mustChangePassword: true },
    });

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);

    const gated = `Bearer ${login.body.token}`;
    expect((await request(app).get('/api/v1/members').set('Authorization', gated)).status).toBe(403);
    expect((await request(app).get('/api/v1/auth/me').set('Authorization', gated)).status).toBe(200);

    const changed = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', gated)
      .send({ currentPassword: password, newPassword: 'chosen-by-me-1' });
    expect(changed.status).toBe(200);

    // The fresh token clears the gate; the stale one still carries it.
    await seedSettings();
    const fresh = `Bearer ${changed.body.token}`;
    expect((await request(app).get('/api/v1/members').set('Authorization', fresh)).status).toBe(200);
    expect((await request(app).get('/api/v1/members').set('Authorization', gated)).status).toBe(403);
  });

  it('is set by a pastor-issued reset and by account creation', async () => {
    const pastor = await createUser({ role: 'pastor' });
    const auth = `Bearer ${signToken({ id: pastor.id, role: pastor.role })}`;

    const created = await request(app)
      .post('/api/v1/users')
      .set('Authorization', auth)
      .send({ fullName: 'New Leader', email: 'new@test.local', password: 'issued-pass-1', role: 'leader' });
    expect(created.status).toBe(201);
    expect((await prisma.user.findUnique({ where: { id: created.body.id } }))?.mustChangePassword).toBe(true);

    const target = await createUser({ role: 'leader' });
    await prisma.user.update({ where: { id: target.id }, data: { mustChangePassword: false } });
    const reset = await request(app)
      .patch(`/api/v1/users/${target.id}/password`)
      .set('Authorization', auth)
      .send({ newPassword: 'reset-pass-1' });
    expect(reset.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: target.id } }))?.mustChangePassword).toBe(true);
  });
});
