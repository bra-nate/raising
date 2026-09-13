import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { metricsService } from '../services/metrics.service';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

// Outcome metrics span every leader and stream — pastor oversight only.
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
