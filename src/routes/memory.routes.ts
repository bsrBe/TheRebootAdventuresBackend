import { Router } from 'express';
import { memoryController } from '../controllers/memory.controller';
import { authenticateAdmin } from '../middleware/admin.auth.middleware';

const router = Router();

// Public routes
router.get('/gallery', memoryController.getPublicMemories);
router.get('/:id/photo', memoryController.getMemoryPhoto);

// Admin routes (mounted at /api/admin/memories)
router.get('/', authenticateAdmin, memoryController.getMemories);
router.patch('/:id/approve', authenticateAdmin, memoryController.approveMemory);
router.delete('/:id', authenticateAdmin, memoryController.deleteMemory);

export default router;
