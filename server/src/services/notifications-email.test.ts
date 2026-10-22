import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../lib/prisma';

vi.mock('../config', () => ({
  config: { resendApiKey: 'test-key', emailFrom: 'raising <notifications@example.com>' },
}));

import { notificationsService } from './notifications.service';

beforeEach(() => vi.restoreAllMocks());

describe('email delivery ledger', () => {
  it('records the provider id for a successful delivery', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'email_123' }), { status: 200 })
    );

    await expect(notificationsService.sendEmail('pastor@example.com', 'Safety alert', '<p>Alert</p>'))
      .resolves.toEqual({ status: 'sent', attempts: 1 });
    expect(await prisma.emailDelivery.findFirst()).toMatchObject({
      status: 'sent', attempts: 1, providerId: 'email_123', lastError: null,
    });
  });

  it('retries transient responses and records eventual success', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'email_456' }), { status: 200 }));

    await expect(notificationsService.sendEmail('pastor@example.com', 'Safety alert', '<p>Alert</p>'))
      .resolves.toEqual({ status: 'sent', attempts: 3 });
    expect(await prisma.emailDelivery.findFirst()).toMatchObject({ status: 'sent', attempts: 3 });
  });

  it('does not retry a permanent provider rejection', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 400 }));

    await expect(notificationsService.sendEmail('bad@example.com', 'Safety alert', '<p>Alert</p>'))
      .resolves.toEqual({ status: 'failed', attempts: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await prisma.emailDelivery.findFirst()).toMatchObject({
      status: 'failed', attempts: 1, lastError: 'Resend returned HTTP 400',
    });
  });

  it('records final failure after three transient responses', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));

    await expect(notificationsService.sendEmail('pastor@example.com', 'Safety alert', '<p>Alert</p>'))
      .resolves.toEqual({ status: 'failed', attempts: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await prisma.emailDelivery.findFirst()).toMatchObject({
      status: 'failed', attempts: 3, lastError: 'Resend returned HTTP 503',
    });
  });
});
