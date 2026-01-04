import { Router } from 'express';
import { TicketController } from '../controllers/ticket.controller';
import { authenticateAdmin, requireRole } from '../middleware/admin.auth.middleware';
import { AdminRole } from '../models/admin.model';

const router = Router();
const ticketController = new TicketController();

/**
 * @route GET /ticket/:reference
 * @desc Verify and display ticket information
 * @access Public (Read-Only)
 */
router.get('/:reference', ticketController.verifyTicket);

// Protect sensitive endpoints
router.use(['/:reference/use', '/checkin/:registrationId', '/:reference/status'], authenticateAdmin);

/**
 * @route POST /ticket/:reference/use
 * @desc Mark ticket as used (check-in)
 * @access Private (event organizers only)
 */
router.post('/:reference/use', requireRole(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.SUPPORT), ticketController.markTicketUsed);

/**
 * @route POST /ticket/checkin/:registrationId
 * @desc Mark attendee as checked in manually
 */
router.post('/checkin/:registrationId', requireRole(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.SUPPORT), ticketController.checkInManual);

/**
 * @route GET /ticket/:reference/status
 * @desc Get ticket status without full details
 * @access Public
 */
router.get('/:reference/status', ticketController.getTicketStatus);

export default router;
