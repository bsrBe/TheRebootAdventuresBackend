import { Request, Response } from 'express';
import { Event } from '../models/events.model';
import { Error as MongooseError } from 'mongoose';
import { Registration } from '../models/user.model';
import { TelegramService } from '../services/telegram.service';

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

    // Fire-and-forget: notify all Telegram users about the new event
    (async () => {
      try {
        const telegramUsers = await Registration.find({
          'telegramData.chatId': { $ne: null },
          'telegramData.is_subscribed': true
        });

        const chatIds = telegramUsers
          .map(user => (user as any).telegramData?.chatId)
          .filter((id: any) => id !== null && id !== undefined);

        if (chatIds.length === 0) {
          return;
        }

        const telegramService = new TelegramService();
        const frontendUrl = process.env.FRONTEND_URL || 'https://your-frontend-url.com';

        const message =
          `🐴 <b>New Event Coming Up!</b>\n\n` +
          `📍 <b>${event.name}</b>\n` +
          (event.description ? `${event.description}\n\n` : '\n') +
          `Tap the button below to view details and sign up.`;

        const replyMarkup = {
          inline_keyboard: [
            [
              {
                text: '🌐 Open Web App',
                web_app: { url: `${frontendUrl}/events` }
              }
            ]
          ]
        };

        await telegramService.broadcastMessage(chatIds, message, { reply_markup: replyMarkup });
      } catch (notifyError) {
        console.error('Failed to broadcast new event notification:', notifyError);
      }
    })();

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
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      Event.find().sort({ date: -1 }).skip(skip).limit(limit),
      Event.countDocuments()
    ]);

    res.json({
      success: true,
      data: events,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
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
    // Import EventRegistration model
    const { EventRegistration } = await import('../models/event-registration.model');
    
    const existingRegistration = await EventRegistration.findOne({
      user: userId,
      event: eventId
    });

    if (existingRegistration) {
      res.status(400).json({ success: false, error: 'User already registered for this event' });
      return;
    }

    // Create new registration
    const registration = new EventRegistration({
      user: userId,
      event: eventId,
      status: 'registered',
      priceAtRegistration: event.price
    });

    await registration.save();

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

/**
 * @desc Update an event (full edit) - Admin only
 * @route PUT /api/events/:id
 */
export const updateEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const updateData = req.body;
    const event = await Event.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!event) {
      res.status(404).json({ success: false, error: 'Event not found' });
      return;
    }
    res.json({ success: true, message: 'Event updated', data: event });
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * @desc Delete an event - Admin only
 * @route DELETE /api/events/:id
 */
export const deleteEvent = async (req: Request, res: Response): Promise<void> => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) {
      res.status(404).json({ success: false, error: 'Event not found' });
      return;
    }
    res.json({ success: true, message: 'Event deleted' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * @desc Get all registrations for an event (Admin only)
 * @route GET /api/events/:id/attendees
 */
export const getEventRegistrations = async (req: Request, res: Response): Promise<void> => {
  try {
    const eventId = req.params.id;

    // Import models
    const { EventRegistration } = await import('../models/event-registration.model');
    const { Invoice } = await import('../models/invoice.model');

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [registrations, total] = await Promise.all([
      EventRegistration.find({ event: eventId })
        .populate('user')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EventRegistration.countDocuments({ event: eventId })
    ]);

    // Get payment details for each attendee
    const attendees = await Promise.all(registrations.map(async (reg: any) => {
      // Find the most recent paid invoice for this user and event
      // or just any paid invoice if event link is missing but metadata matches
      const invoice = await Invoice.findOne({
        user: reg.user?._id,
        $or: [
          { event: eventId },
          { 'metadata.eventName': (await Event.findById(eventId))?.name }
        ],
        status: 'paid'
      }).sort({ paidAt: -1 }).lean();

      return {
        id: reg._id,
        user: {
          id: reg.user?._id,
          fullName: reg.user?.fullName,
          email: reg.user?.email,
          phoneNumber: reg.user?.phoneNumber,
          telegramUsername: reg.user?.telegramData?.username,
          experience: reg.user?.horseRidingExperience,
          age: reg.user?.age,
          weight: reg.user?.weight,
          height: reg.user?.height
        },
        status: reg.status,
        paymentStatus: invoice ? 'paid' : 'unpaid',
        paidAmount: invoice?.amount,
        paidAt: invoice?.paidAt,
        registrationDate: reg.createdAt,
        checkedIn: reg.checkedIn,
        checkedInAt: reg.checkedInAt
      };
    }));
      // Get stats for the entire event registrations
      const stats = await Registration.aggregate([
        { $match: { event: eventId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            confirmed: { $sum: { $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0] } },
            // The 'paid' and 'totalRevenue' fields are not directly available on EventRegistration
            // and would require a lookup/join with the Invoice collection, which is complex for a simple aggregate.
            // For now, these will be 0 or require a separate calculation.
            paid: { $sum: 0 }, // Placeholder, as paymentStatus is derived from Invoice
            totalRevenue: { $sum: 0 }, // Placeholder, as paidAmount is derived from Invoice
            checkedIn: { $sum: { $cond: ["$checkedIn", 1, 0] } }
          }
        }
      ]);

      const eventStats = stats.length > 0 ? stats[0] : { total: 0, confirmed: 0, paid: 0, totalRevenue: 0, checkedIn: 0 };

      res.status(200).json({
        success: true,
        data: attendees,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
        stats: eventStats
      });
  } catch (error) {
    console.error('Get event registrations error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
