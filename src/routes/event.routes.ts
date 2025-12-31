import { Router } from 'express';
import { authenticateAdmin } from '../middleware/admin.auth.middleware';
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

router.post('/', createEvent); // Create new event
router.patch('/:id/status', updateEventStatus); // Update event status
router.put('/:id', updateEvent); // Full update of event
router.delete('/:id', deleteEvent); // Delete event
router.get('/:id/attendees', getEventRegistrations); // Get event attendees

export default router;
