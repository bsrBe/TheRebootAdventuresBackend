import { Document } from 'mongoose';

export interface ITelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
}

export interface IRegistration extends Document {
  fullName: string;
  email: string;
  phoneNumber: string;
  age: number;
  weight: number;
  height: number;
  horseRidingExperience: 'none' | 'beginner' | 'intermediate' | 'advanced';
  referralSource: string;
  telegramData?: ITelegramUser | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRegistrationInput {
  fullName: string;
  email: string;
  phoneNumber: string;
  age: number;
  weight: number;
  height: number;
  horseRidingExperience: 'none' | 'beginner' | 'intermediate' | 'advanced';
  referralSource: string;
  telegramData?: ITelegramUser | null;
}
