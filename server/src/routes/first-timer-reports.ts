import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { firstTimerReportsService } from '../services/first-timer-reports.service';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();
const FOLLOWUP = ['pastor', 'followup_team_lead', 'followup_team_member'] as const;

router.use(authenticate);

router.get(
  '/',
  requireRole(...FOLLOWUP),
  asyncHandler(async (req, res) => {
    const firstTimerId = typeof req.query.firstTimerId === 'string' ? req.query.firstTimerId : '';
    res.json(await firstTimerReportsService.listReports(req.user!, firstTimerId));
  })
);

router.post(
  '/',
  requireRole(...FOLLOWUP),
  asyncHandler(async (req, res) => {
    const report = await firstTimerReportsService.createReport(req.user!, req.body ?? {});
    res.status(201).json(report);
  })
);

export default router;
