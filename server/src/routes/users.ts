import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { usersService } from '../services/users.service';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

// All user-management routes are pastor or superadmin.
router.use(authenticate, requireRole('pastor', 'superadmin'));

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const result = await usersService.listUsers();
    res.json(result);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { fullName, email, password, role } = req.body ?? {};
    const user = await usersService.createUser(req.user!.id, { fullName, email, password, role });
    res.status(201).json(user);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { fullName, role } = req.body ?? {};
    const user = await usersService.updateUser(req.user!.id, req.params.id, { fullName, role });
    res.json(user);
  })
);

router.patch(
  '/:id/deactivate',
  asyncHandler(async (req, res) => {
    const user = await usersService.deactivateUser(req.user!.id, req.params.id);
    res.json(user);
  })
);

export default router;
