import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createApp } from '../app';
import { prisma } from '../lib/prisma';
import { createUser } from '../test/fixtures';

const app = createApp();

afterEach(() => vi.restoreAllMocks());

describe('login abuse controls', () => {
  it('returns 429 with a retry interval after five attempts', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'target@example.com', password: 'wrong-password' })
        .expect(401);
    }

    const limited = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'TARGET@example.com', password: 'wrong-password' })
      .expect(429);

    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('isolates accounts and permits a valid login after the window', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const user = await createUser({ email: 'member@example.com' });
    await prisma.user.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash('correct-password', 4) },
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'wrong-password' })
        .expect(401);
    }

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'someone-else@example.com', password: 'wrong-password' })
      .expect(401);

    vi.mocked(Date.now).mockReturnValue(now + 15 * 60 * 1000);
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'correct-password' })
      .expect(200);
  });

  it('sets baseline security headers without exposing Express', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['permissions-policy']).toContain('camera=()');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
