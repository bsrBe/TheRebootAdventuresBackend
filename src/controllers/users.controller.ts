import { Request, Response } from 'express';
import { IRegistration, IRegistrationInput } from '../interfaces/user.interface';
import { Registration } from '../models/user.model';
import { Error as MongooseError } from 'mongoose';

export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const registrationData: IRegistrationInput = {
      ...req.body,
      telegramData: req.body.telegramData || null
    };
    
    const registration = new Registration(registrationData);
    await registration.save();
    
    res.status(201).json({
      success: true,
      data: registration
    });
  } catch (error: unknown) {
    if (error instanceof MongooseError.ValidationError) {
      const messages = Object.values(error.errors).map((err: any) => err.message);
      res.status(400).json({
        success: false,
        error: messages
      });
      return;
    }
    
    if ((error as any).code === 11000) {
      res.status(400).json({
        success: false,
        error: 'Email or phone number already registered'
      });
      return;
    }
    
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const registrations: IRegistration[] = await Registration.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      count: registrations.length,
      data: registrations
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

export const getUserByTelegramId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = await Registration.findOne({ 'telegramData.id': id });

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found'
      });
      return;
    }

    // Fetch user's event registrations
    const { EventRegistration } = await import('../models/event-registration.model');
    const registrations = await EventRegistration.find({ user: user._id })
      .select('event status registrationDate')
      .lean();

    // Format registrations to match the old structure
    const registeredEvents = registrations.map(reg => ({
      eventId: reg.event.toString(),
      status: reg.status,
      registeredAt: reg.registrationDate
    }));

    res.json({
      success: true,
      data: {
        ...user.toJSON(),
        registeredEvents
      }
    });
  } catch (error) {
    console.error('Get user by Telegram ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};
