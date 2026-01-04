import { Router } from 'express';
import { authenticateAdmin, requireRole } from '../middleware/admin.auth.middleware';
import { AdminRole } from '../models/admin.model';
import {
  registerUser,
  getUsers,
  getUserByTelegramId,
  updateUser,
  deleteUser,
  exportUsers,
} from '../controllers/users.controller';

const router = Router();

// Public routes (registration only)
router.post('/', registerUser);
router.get('/telegram/:id', getUserByTelegramId);

// Admin-protected routes
router.use(authenticateAdmin);

router.get('/', getUsers);

router.get('/export', exportUsers);

router.put('/:id', requireRole(AdminRole.SUPER_ADMIN, AdminRole.ADMIN), updateUser);
router.delete('/:id', requireRole(AdminRole.SUPER_ADMIN, AdminRole.ADMIN), deleteUser);

export default router;
