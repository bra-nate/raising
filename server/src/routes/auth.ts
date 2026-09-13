import { Router } from 'express';
import { authService } from '../services/auth.service';
import { authenticate } from '../middleware/authenticate';
import { asyncHandler } from '../lib/asyncHandler';
import { AppError } from '../lib/errors';

const router = Router();

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      throw new AppError(400, 'Email and password are required');
    }
    const result = await authService.login(String(email).toLowerCase(), String(password));
    res.json(result);
  })
);

// Stateless JWT — client discards the token. Endpoint exists for symmetry.
router.post('/logout', authenticate, (_req, res) => {
  res.json({ ok: true });
});

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const profile = await authService.getProfile(req.user!.id);
    res.json(profile);
  })
);

router.post(
  '/change-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword) {
      throw new AppError(400, 'currentPassword and newPassword are required');
    }
    await authService.changePassword(req.user!.id, String(currentPassword), String(newPassword));
    res.json({ ok: true });
  })
);

export default router;
