import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { asyncHandler } from '../lib/asyncHandler';
import { notificationsService } from '../services/notifications.service';

const router = Router();

// All authenticated users have notifications — no role guard.
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await notificationsService.list(req.user!.id);
    res.json(result); // { data, unreadCount }
  })
);

router.patch(
  '/read-all',
  authenticate,
  asyncHandler(async (req, res) => {
    await notificationsService.markAllRead(req.user!.id);
    res.json({ ok: true });
  })
);

router.patch(
  '/:id/read',
  authenticate,
  asyncHandler(async (req, res) => {
    await notificationsService.markRead(req.user!.id, req.params.id);
    res.json({ ok: true });
  })
);

export default router;
