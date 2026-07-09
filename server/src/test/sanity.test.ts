import { describe, it, expect } from 'vitest';
import { prisma } from '../lib/prisma';
import { createUser } from './fixtures';

describe('test harness', () => {
  it('starts each test with an empty users table', async () => {
    expect(await prisma.user.count()).toBe(0);
  });

  it('can create and read a user', async () => {
    await createUser({ role: 'pastor' });
    expect(await prisma.user.count()).toBe(1);
  });
});
