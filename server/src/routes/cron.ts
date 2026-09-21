import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import {
  runReportReminder,
  runRetentionReview,
  runSafetyEscalation,
  runSilenceDetection,
} from '../jobs/scheduler';

const router = Router();

router.use((req, res, next) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.get('authorization') !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
});

router.get('/daily', asyncHandler(async (_req, res) => {
  await runSilenceDetection();
  await runRetentionReview();
  await runReportReminder();
  res.json({ status: 'ok' });
}));

router.get('/hourly', asyncHandler(async (_req, res) => {
  await runSafetyEscalation();
  res.json({ status: 'ok' });
}));

export default router;
