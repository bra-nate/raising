import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { dashboardService } from '../services/dashboard.service';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

router.get(
  '/pastor',
  authenticate,
  requireRole('pastor'),
  asyncHandler(async (_req, res) => {
    const data = await dashboardService.pastorDashboard();
    res.json(data);
  })
);

export default router;
