import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { membersService } from '../services/members.service';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requireRole('pastor', 'leader'),
  asyncHandler(async (req, res) => {
    const result = await membersService.listMembers(req.user!);
    res.json(result);
  })
);

router.post(
  '/',
  requireRole('pastor', 'leader'),
  asyncHandler(async (req, res) => {
    const member = await membersService.createMember(req.user!, req.body ?? {});
    res.status(201).json(member);
  })
);

router.get(
  '/:id',
  requireRole('pastor', 'leader'),
  asyncHandler(async (req, res) => {
    const member = await membersService.getMember(req.user!, req.params.id);
    res.json(member);
  })
);

router.patch(
  '/:id',
  requireRole('pastor', 'leader'),
  asyncHandler(async (req, res) => {
    const member = await membersService.updateMember(req.user!, req.params.id, req.body ?? {});
    res.json(member);
  })
);

router.patch(
  '/:id/deactivate',
  requireRole('pastor'),
  asyncHandler(async (req, res) => {
    const member = await membersService.deactivateMember(req.user!, req.params.id);
    res.json(member);
  })
);

export default router;
