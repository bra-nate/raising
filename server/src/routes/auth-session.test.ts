import { describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app';
import { createUser } from '../test/fixtures';
import { hashPassword } from '../lib/password';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { SESSION_COOKIE } from '../lib/authSession';

const app = createApp();

describe('browser sessions', () => {
  it('keeps the credential in an HttpOnly cookie and clears it on logout', async () => {
    const browser = request.agent(app);
    const password = 'browser-session-1';
    const user = await createUser({ role: 'leader' });
    await prisma.user.update({
      where: { id: user.id },
      data: { password: await hashPassword(password) },
    });

    const login = await browser
      .post('/api/v1/auth/login')
      .send({ email: user.email, password })
      .expect(200);

    expect(login.body).toEqual({
      user: expect.objectContaining({ id: user.id, email: user.email }),
    });
    expect(login.headers['set-cookie'][0]).toContain('raising_session=');
    expect(login.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(login.headers['set-cookie'][0]).toContain('SameSite=Lax');
    await browser.get('/api/v1/auth/me').expect(200);

    await browser.post('/api/v1/auth/logout').set('Origin', config.clientUrl).expect(200);
    await browser.get('/api/v1/auth/me').expect(401);
  });

  it('rejects cross-site mutations made with a session cookie', async () => {
    const browser = request.agent(app);
    const password = 'browser-session-2';
    const user = await createUser({ role: 'leader' });
    await prisma.user.update({
      where: { id: user.id },
      data: { password: await hashPassword(password) },
    });

    await browser
      .post('/api/v1/auth/login')
      .send({ email: user.email, password })
      .expect(200);

    const response = await browser
      .post('/api/v1/auth/logout')
      .set('Origin', 'https://attacker.example')
      .expect(403);

    expect(response.body.code).toBe('INVALID_ORIGIN');
    await browser.get('/api/v1/auth/me').expect(200);
  });

  it('rejects an expired session cookie', async () => {
    const user = await createUser({ role: 'leader' });
    const expired = jwt.sign({ id: user.id, role: user.role }, config.jwtSecret, {
      expiresIn: -1,
    });

    await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${expired}`)
      .expect(401);
  });
});
