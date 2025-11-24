import { Request, Response } from 'express';
import { Event } from '../models/events.model';
import { Error as MongooseError } from 'mongoose';

/**
 * @desc Create new event (Admin only)
 * @route POST /api/events
 */
export const createEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, date, location, price, capacity } = req.body;

    const event = new Event({
      name,
      description,
      date,
      location,
      price,
      capacity
    });

    await event.save();

    res.status(201).json({
      success: true,
      message: 'Event created successfully',
      data: event
    });
  } catch (error: unknown) {
    if (error instanceof MongooseError.ValidationError) {
      const messages = Object.values(error.errors).map((err: any) => err.message);
      res.status(400).json({ success: false, error: messages });
      return;
    }

    console.error('Create event error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * @desc Get all events
 * @route GET /api/events
 */
export const getEvents = async (req: Request, res: Response): Promise<void> => {
  try {
    const events = await Event.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      count: events.length,
      data: events
    });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * @desc Get single event by ID
 * @route GET /api/events/:id
 */
export const getEventById = async (req: Request, res: Response): Promise<void> => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      res.status(404).json({ success: false, error: 'Event not found' });
      return;
    }

    res.json({ success: true, data: event });
  } catch (error) {
    console.error('Get event by ID error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * @desc Update event status (Admin only)
 * @route PATCH /api/events/:id/status
 */
export const updateEventStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { isActive } = req.body;

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true, runValidators: true }
    );

    if (!event) {
      res.status(404).json({ success: false, error: 'Event not found' });
      return;
    }

    res.json({
      success: true,
      message: 'Event status updated',
      data: event
    });
  } catch (error) {
    console.error('Update event status error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * @desc Sign up for an event
 * @route POST /api/events/:id/signup
 */
export const signupForEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.body;
    const eventId = req.params.id;

    if (!userId) {
      res.status(400).json({ success: false, error: 'User ID is required' });
      return;
    }

    // Check if event exists
    const event = await Event.findById(eventId);
    if (!event) {
      res.status(404).json({ success: false, error: 'Event not found' });
      return;
    }

    if (!event.isActive) {
      res.status(400).json({ success: false, error: 'Event is not active' });
      return;
    }

    // Check if user exists
    // We need to import Registration model dynamically or at top level if possible
    // To avoid circular deps if any, but models usually fine.
    // Let's assume we can import it.
    const { Registration } = await import('../models/user.model');
    const user = await Registration.findById(userId);

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    // Check if already registered
    const isRegistered = user.registeredEvents?.some(
      (e) => e.eventId.toString() === eventId
    );

    if (isRegistered) {
      res.status(400).json({ success: false, error: 'User already registered for this event' });
      return;
    }

    // Add to registeredEvents
    user.registeredEvents = user.registeredEvents || [];
    user.registeredEvents.push({
      eventId: event._id as any,
      eventName: event.name,
      registrationDate: new Date(),
      status: 'registered'
    });

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Successfully signed up for event',
      data: {
        eventName: event.name,
        status: 'registered'
      }
    });

  } catch (error) {
    console.error('Signup for event error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
