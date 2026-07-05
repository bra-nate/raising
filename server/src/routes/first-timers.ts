import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { firstTimersService } from '../services/first-timers.service';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();
const FOLLOWUP = ['pastor', 'followup_team_lead', 'followup_team_member'] as const;

router.use(authenticate);

router.get(
  '/',
  requireRole(...FOLLOWUP),
  asyncHandler(async (req, res) => {
    res.json(await firstTimersService.listFirstTimers(req.user!));
  })
);

router.post(
  '/',
  requireRole(...FOLLOWUP),
  asyncHandler(async (req, res) => {
    const ft = await firstTimersService.createFirstTimer(req.user!, req.body ?? {});
    res.status(201).json(ft);
  })
);

// Must precede '/:id'.
router.post(
  '/batch',
  requireRole(...FOLLOWUP),
  asyncHandler(async (req, res) => {
    const result = await firstTimersService.createBatch(req.user!, req.body ?? {});
    res.status(201).json(result);
  })
);

router.get(
  '/:id',
  requireRole(...FOLLOWUP),
  asyncHandler(async (req, res) => {
    res.json(await firstTimersService.getFirstTimer(req.user!, req.params.id));
  })
);

router.patch(
  '/:id',
  requireRole('pastor', 'followup_team_lead'),
  asyncHandler(async (req, res) => {
    res.json(await firstTimersService.updateFirstTimer(req.user!, req.params.id, req.body ?? {}));
  })
);

router.post(
  '/:id/convert',
  requireRole('pastor', 'followup_team_lead'),
  asyncHandler(async (req, res) => {
    const member = await firstTimersService.convertToMember(req.user!, req.params.id, req.body ?? {});
    res.status(201).json(member);
  })
);

export default router;
