import { Router } from 'express';
import { memoryController } from '../controllers/memory.controller';
import { authenticateAdmin, requireRole } from '../middleware/admin.auth.middleware';
import { AdminRole } from '../models/admin.model';

const router = Router();

// Public routes
router.get('/gallery', memoryController.getPublicMemories);
router.get('/:id/photo', memoryController.getMemoryPhoto);

// Admin routes (mounted at /api/admin/memories)
router.get('/', authenticateAdmin, memoryController.getMemories);
router.patch('/:id/approve', authenticateAdmin, requireRole(AdminRole.SUPER_ADMIN, AdminRole.ADMIN), memoryController.approveMemory);
router.delete('/:id', authenticateAdmin, requireRole(AdminRole.SUPER_ADMIN, AdminRole.ADMIN), memoryController.deleteMemory);

export default router;
