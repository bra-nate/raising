import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { casesService } from '../services/cases.service';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

// Cases carry pastoral content. Per the superadmin design, a platform
// administrator manages accounts, settings and audits — never pastoral data.
router.use(authenticate, requireRole('pastor', 'leader'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, kind, memberId } = req.query;
    const result = await casesService.listCases(req.user!, {
      status: status ? String(status) : undefined,
      kind: kind ? String(kind) : undefined,
      memberId: memberId ? String(memberId) : undefined,
    });
    res.json(result);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await casesService.getCase(req.user!, req.params.id));
  })
);

router.patch(
  '/:id/acknowledge',
  asyncHandler(async (req, res) => {
    res.json(await casesService.acknowledgeCase(req.user!, req.params.id));
  })
);

router.patch(
  '/:id/assign',
  asyncHandler(async (req, res) => {
    const { ownerId } = req.body ?? {};
    res.json(await casesService.assignCase(req.user!, req.params.id, String(ownerId ?? '')));
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { actionPlan, dueDate } = req.body ?? {};
    res.json(await casesService.updateCase(req.user!, req.params.id, { actionPlan, dueDate }));
  })
);

router.patch(
  '/:id/resolve',
  asyncHandler(async (req, res) => {
    const { resolutionNote } = req.body ?? {};
    res.json(await casesService.resolveCase(req.user!, req.params.id, String(resolutionNote ?? '')));
  })
);

export default router;
