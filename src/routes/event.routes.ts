import { Router } from 'express';
import {
  createEvent,
  getEvents,
  getEventById,
  updateEventStatus,
  signupForEvent
} from '../controllers/events.controler';

const router = Router();

// Admin routes (can later be protected by middleware)
router.post('/', createEvent); // Create new event
router.get('/', getEvents); // Get all events
router.get('/:id', getEventById); // Get single event
router.patch('/:id/status', updateEventStatus); // Update event status
router.post('/:id/signup', signupForEvent); // Sign up for an event

export default router;
