import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { memberReportsService } from '../services/member-reports.service';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

router.use(authenticate, requireRole('pastor', 'leader'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const memberId = typeof req.query.memberId === 'string' ? req.query.memberId : '';
    const result = await memberReportsService.listReports(req.user!, memberId);
    res.json(result);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const report = await memberReportsService.createReport(req.user!, req.body ?? {});
    res.status(201).json(report);
  })
);

router.patch(
  '/:id/redact',
  asyncHandler(async (req, res) => {
    const report = await memberReportsService.redactReport(req.user!, req.params.id, req.body?.redactionSummary);
    res.json(report);
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await memberReportsService.deleteReport(req.user!, req.params.id);
    res.json(result);
  })
);

export default router;
