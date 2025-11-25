import { Document, Model, Types } from 'mongoose';

export interface ITelegramData {
  id: number;
  chatId: string | number;  // Unique chat ID for sending messages
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_bot?: boolean;
  last_activity?: Date;     // Last interaction timestamp
  is_subscribed?: boolean;  // If user is subscribed to notifications
  photo_url?: string;       // URL to user's profile photo
}

export interface IRegistration extends Document {
  userType: 'user';
  _id: Types.ObjectId;
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  age: number;
  weight: number;
  height: number;
  horseRidingExperience: 'beginner' | 'intermediate' | 'advanced';
  referralSource: string;
  telegramData?: ITelegramData;
  isAdmin?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Static methods
export interface IRegistrationModel extends Model<IRegistration> {
  findByTelegramId(telegramId: number): Promise<IRegistration | null>;
}

export interface IRegistrationInput {
  fullName: string;
  email: string;
  phoneNumber: string;
  age: number;
  weight: number;
  height: number;
  horseRidingExperience: 'beginner' | 'intermediate' | 'advanced';
  referralSource: string;
  telegramData?: ITelegramData;
  isAdmin?: boolean;
}
