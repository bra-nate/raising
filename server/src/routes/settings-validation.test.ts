import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { signToken } from '../lib/jwt';
import { createUser } from '../test/fixtures';

const app = createApp();

const cases = [
  { key: 'reportThresholdDays', valid: ['1', '365'], invalid: ['0', '366', '1.5'] },
  { key: 'allowDeleteReports', valid: ['true', 'false'], invalid: ['TRUE', 'banana'] },
  { key: 'deletePermission', valid: ['pastor_only', 'leaders'], invalid: ['everyone'] },
  { key: 'notificationsEnabled', valid: ['true', 'false'], invalid: ['yes'] },
  { key: 'reportReminderDay', valid: ['monday', 'sunday'], invalid: ['noday'] },
  { key: 'safetyAckHours', valid: ['1', '168'], invalid: ['0', '169'] },
  { key: 'concernDueDays', valid: ['1', '365'], invalid: ['0', '366'] },
  { key: 'firstContactDays', valid: ['1', '90'], invalid: ['0', '91'] },
  { key: 'retentionMonths', valid: ['0', '120'], invalid: ['-1', '121'] },
  { key: 'retentionMode', valid: ['report_only', 'report_and_redact'], invalid: ['automatic_delete'] },
];

describe('settings validation', () => {
  it.each(cases)('enforces the $key policy', async ({ key, valid, invalid }) => {
    const pastor = await createUser({ role: 'pastor' });
    const authorization = `Bearer ${signToken({ id: pastor.id, role: pastor.role })}`;

    for (const value of valid) {
      const response = await request(app)
        .put(`/api/v1/settings/${key}`)
        .set('Authorization', authorization)
        .send({ value })
        .expect(200);
      expect(response.body.value).toBe(value);
    }

    for (const value of invalid) {
      const response = await request(app)
        .put(`/api/v1/settings/${key}`)
        .set('Authorization', authorization)
        .send({ value })
        .expect(400);
      expect(response.body.code).toBe('INVALID_SETTING_VALUE');
    }
  });
});
