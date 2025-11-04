import { Router } from 'express';
import { registerUser, getUsers } from '../controllers/users.controller';

const router = Router();

// User routes
router
  .route('/')
  .post(registerUser)
  .get(getUsers);

export default router;
