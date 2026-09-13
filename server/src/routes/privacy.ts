import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { privacyService } from '../services/privacy.service';
import { asyncHandler } from '../lib/asyncHandler';
import { AppError } from '../lib/errors';

const router = Router();

// Retention, subject access and access review are all pastor oversight.
router.use(authenticate, requireRole('pastor', 'superadmin'));

function parseType(value: string): 'member' | 'first_timer' {
  if (value !== 'member' && value !== 'first_timer') throw new AppError(400, 'type must be member or first_timer');
  return value;
}

router.get(
  '/retention',
  asyncHandler(async (_req, res) => {
    res.json(await privacyService.listRetentionCandidates());
  })
);

router.post(
  '/retention/:type/:id/redact',
  asyncHandler(async (req, res) => {
    const type = parseType(req.params.type);
    res.json(await privacyService.redactForRetention(req.user!, type, req.params.id));
  })
);

router.get(
  '/export/:type/:id',
  asyncHandler(async (req, res) => {
    const type = parseType(req.params.type);
    const data = await privacyService.exportPerson(req.user!, type, req.params.id);
    res.json(data);
  })
);

router.get(
  '/confidential-access',
  asyncHandler(async (req, res) => {
    const days = req.query.days ? Number(req.query.days) : 90;
    res.json(await privacyService.confidentialAccessReview(req.user!, Number.isFinite(days) ? days : 90));
  })
);

router.patch(
  '/legal-basis/:type/:id',
  asyncHandler(async (req, res) => {
    const type = parseType(req.params.type);
    const { legalBasis, consentNote } = req.body ?? {};
    res.json(await privacyService.setLegalBasis(req.user!, type, req.params.id, { legalBasis, consentNote }));
  })
);

export default router;
