import { Router } from 'express';
import { registerUser, getUsers, getUserByTelegramId } from '../controllers/users.controller';

const router = Router();

// User routes
router
  .route('/')
  .post(registerUser)
  .get(getUsers);

router.get('/telegram/:id', getUserByTelegramId);

export default router;
