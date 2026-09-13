import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { groupsService } from '../services/groups.service';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

router.use(authenticate);

// A leader may read their own groups; only the pastor restructures them.
router.get(
  '/',
  requireRole('pastor', 'superadmin', 'leader'),
  asyncHandler(async (req, res) => {
    res.json(await groupsService.listGroups(req.user!));
  })
);

router.use(requireRole('pastor', 'superadmin'));

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const group = await groupsService.createGroup(req.user!, req.body ?? {});
    res.status(201).json(group);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await groupsService.updateGroup(req.user!, req.params.id, req.body ?? {}));
  })
);

router.patch(
  '/:id/move-members',
  asyncHandler(async (req, res) => {
    const { targetGroupId } = req.body ?? {};
    res.json(await groupsService.moveMembers(req.user!, req.params.id, targetGroupId ?? null));
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await groupsService.deleteGroup(req.user!, req.params.id));
  })
);

export default router;
