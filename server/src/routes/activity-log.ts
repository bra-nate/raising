import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { activityLogService } from '../services/activity-log.service';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

// Read-only audit trail. Pastor + superadmin only. No write/delete endpoints.
router.use(authenticate, requireRole('pastor', 'superadmin'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = req.query.page ? parseInt(String(req.query.page), 10) : undefined;
    const pageSize = req.query.pageSize ? parseInt(String(req.query.pageSize), 10) : undefined;
    const action = typeof req.query.action === 'string' ? req.query.action : undefined;
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const result = await activityLogService.listLogs({ page, pageSize, action, userId });
    res.json(result);
  })
);

export default router;
