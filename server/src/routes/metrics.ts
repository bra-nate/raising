import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { metricsService } from '../services/metrics.service';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

// Aggregates only: rates, medians, leader and group names. No member names and
// no report content, so a superadmin may read them. Anything that exposes what
// a leader actually wrote stays pastor-only.
router.use(authenticate, requireRole('pastor', 'superadmin'));

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await metricsService.getMetrics());
  })
);

router.get(
  '/export.csv',
  asyncHandler(async (_req, res) => {
    const csv = await metricsService.exportCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="raising-metrics.csv"');
    res.send(csv);
  })
);

export default router;
