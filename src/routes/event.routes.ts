import { Router } from 'express';
import { authenticateAdmin, requireRole } from '../middleware/admin.auth.middleware';
import { AdminRole } from '../models/admin.model';
import {
  createEvent,
  getEvents,
  getEventById,
  updateEventStatus,
  signupForEvent,
  updateEvent,
  deleteEvent,
  getEventRegistrations
} from '../controllers/events.controler';

const router = Router();
router.post('/:id/signup', signupForEvent);
router.get('/', getEvents); // Get all events
router.get('/:id', getEventById); // Get single event
// Protect all admin routes
router.use(authenticateAdmin);

router.post('/', requireRole(AdminRole.SUPER_ADMIN, AdminRole.ADMIN), createEvent); // Create new event
router.patch('/:id/status', requireRole(AdminRole.SUPER_ADMIN, AdminRole.ADMIN), updateEventStatus); // Update event status
router.put('/:id', requireRole(AdminRole.SUPER_ADMIN, AdminRole.ADMIN), updateEvent); // Full update of event
router.delete('/:id', requireRole(AdminRole.SUPER_ADMIN, AdminRole.ADMIN), deleteEvent); // Delete event
router.get('/:id/attendees', getEventRegistrations); // Get event attendees

export default router;
