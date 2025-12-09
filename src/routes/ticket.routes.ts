import { Router } from 'express';
import { TicketController } from '../controllers/ticket.controller';

const router = Router();
const ticketController = new TicketController();

/**
 * @route GET /ticket/:reference
 * @desc Verify and display ticket information
 * @access Public
 */
router.get('/:reference', ticketController.verifyTicket);

/**
 * @route POST /ticket/:reference/use
 * @desc Mark ticket as used (check-in)
 * @access Private (event organizers only)
 */
router.post('/:reference/use', ticketController.markTicketUsed);

/**
 * @route GET /ticket/:reference/status
 * @desc Get ticket status without full details
 * @access Public
 */
router.get('/:reference/status', ticketController.getTicketStatus);

export default router;
