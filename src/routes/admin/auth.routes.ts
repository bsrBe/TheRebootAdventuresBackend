import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { AdminAuthController } from '../../controllers/admin/auth.controller';
import { authenticateAdmin, requireRole } from '../../middleware/admin.auth.middleware';
import { AdminRole } from '../../models/admin.model';
import { Request, Response, NextFunction } from 'express';

const router = Router();

// Validation middleware
const validate = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      message: 'Validation failed',
      errors: errors.array() 
    });
  }
  next();
};

// Public routes
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').exists().withMessage('Password is required'),
    validate
  ],
  AdminAuthController.login
);

router.post(
  '/setup',
  [
    body('token').notEmpty().withMessage('Token is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
      .matches(/\d/)
      .withMessage('Password must contain a number'),
    body('firstName').notEmpty().withMessage('First name is required'),
    body('lastName').notEmpty().withMessage('Last name is required'),
    validate
  ],
  AdminAuthController.setupAccount
);

router.post(
  '/refresh-token',
  [
    body('refreshToken').notEmpty().withMessage('Refresh token is required'),
    validate
  ],
  AdminAuthController.refreshToken
);

router.post(
  '/forgot-password',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    validate
  ],
  AdminAuthController.forgotPassword
);

router.post(
  '/reset-password',
  [
    body('token').notEmpty().withMessage('Token is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
      .matches(/\d/)
      .withMessage('Password must contain a number'),
    validate
  ],
  AdminAuthController.resetPassword
);

// Protected routes
router.use(authenticateAdmin);

router.get('/profile', AdminAuthController.getProfile);

router.post(
  '/profile/update',
  [
    body('firstName').optional().notEmpty().withMessage('First name cannot be empty'),
    body('lastName').optional().notEmpty().withMessage('Last name cannot be empty'),
    body('email').optional().isEmail().withMessage('Valid email is required'),
    validate
  ],
  AdminAuthController.updateProfile
);

router.post(
  '/change-password',
  [
    body('oldPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
      .matches(/\d/)
      .withMessage('Password must contain a number'),
    validate
  ],
  AdminAuthController.changePassword
);

router.post(
  '/invite',
  requireRole(AdminRole.SUPER_ADMIN, AdminRole.ADMIN),
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('role').isIn(Object.values(AdminRole)).withMessage('Invalid role'),
    validate
  ],
  AdminAuthController.inviteAdmin
);

export default router;
