import { Router } from 'express';
import { authenticateAdmin } from '../middleware/admin.auth.middleware';
import {
  registerUser,
  getUsers,
  getUserByTelegramId,
  updateUser,
  deleteUser,
  exportUsers,
} from '../controllers/users.controller';

const router = Router();

// Public routes (registration and lookup)
router.post('/', registerUser);
router.get('/', getUsers);
router.get('/telegram/:id', getUserByTelegramId);

// Admin-protected routes
router.use(authenticateAdmin);
router.get('/export', exportUsers);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

export default router;
