import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { privacyService } from '../services/privacy.service';
import { asyncHandler } from '../lib/asyncHandler';
import { AppError } from '../lib/errors';

const router = Router();

// Subject-access exports return full report content, confidential and
// safety-flagged included. Pastor only — a superadmin has no pastoral access.
router.use(authenticate, requireRole('pastor'));

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

    if (req.query.format === 'csv') {
      const csv = await privacyService.exportPersonCsv(req.user!, type, req.params.id);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-${req.params.id}.csv"`);
      res.send(csv);
      return;
    }

    res.json(await privacyService.exportPerson(req.user!, type, req.params.id));
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
