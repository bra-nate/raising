import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { settingsService } from '../services/settings.service';
import { asyncHandler } from '../lib/asyncHandler';
import { AppError } from '../lib/errors';

const router = Router();

// Any authenticated user may read settings (silence thresholds, toggles, etc.).
router.get(
  '/',
  authenticate,
  asyncHandler(async (_req, res) => {
    const data = await settingsService.getAll();
    res.json({ data });
  })
);

// Only pastor + superadmin may change settings.
router.put(
  '/:key',
  authenticate,
  requireRole('pastor', 'superadmin'),
  asyncHandler(async (req, res) => {
    const { value } = req.body ?? {};
    if (typeof value !== 'string') throw new AppError(400, 'value is required');
    const result = await settingsService.update(req.user!.id, req.params.key, value);
    res.json(result);
  })
);

export default router;
