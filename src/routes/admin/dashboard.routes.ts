import { Router } from 'express';
import { DashboardController } from '../../controllers/admin/dashboard.controller';
import { authenticateAdmin } from '../../middleware/admin.auth.middleware';

const router = Router();

// All dashboard routes are protected
router.use(authenticateAdmin);

router.get('/stats', DashboardController.getStats);
router.get('/activity', DashboardController.getRecentActivity);

export default router;
