import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app';
import { runSafetyEscalation } from '../jobs/scheduler';

vi.mock('../jobs/scheduler', () => ({
  runReportReminder: vi.fn(),
  runRetentionReview: vi.fn(),
  runSafetyEscalation: vi.fn(),
  runSilenceDetection: vi.fn(),
}));

afterEach(() => {
  delete process.env.CRON_SECRET;
  vi.clearAllMocks();
});

describe('cron routes', () => {
  it('rejects requests without a configured secret', async () => {
    await request(createApp()).get('/api/v1/internal/cron/hourly').expect(401);
    expect(runSafetyEscalation).not.toHaveBeenCalled();
  });

  it('runs only with the configured bearer token', async () => {
    process.env.CRON_SECRET = 'test-secret';
    const app = createApp();
    await request(app).get('/api/v1/internal/cron/hourly').expect(401);
    await request(app).get('/api/v1/internal/cron/hourly')
      .set('Authorization', 'Bearer test-secret').expect(200);
    expect(runSafetyEscalation).toHaveBeenCalledTimes(1);
  });
});
