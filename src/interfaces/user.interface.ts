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

export interface IInvoiceBase {
  invoiceId: string;
  eventName: string;
  amount: number;
  place: string;
  time: Date;
  chapaLink: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
  createdAt?: Date;
  updatedAt?: Date;
  paidAt?: Date | null;
  chapaReference?: string;
  metadata?: Record<string, any>;
}

export interface IInvoice extends IInvoiceBase, Document {
  // Add any document methods here if needed
  toObject(): IInvoiceBase & { _id: string };
}

export interface IRegisteredEvent {
  eventId: Types.ObjectId;
  eventName: string;
  registrationDate: Date;
  status: 'registered' | 'payment_initiated' | 'paid' | 'cancelled';
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
  registeredEvents: IRegisteredEvent[];
  invoices: IInvoice[];
  isAdmin?: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  // Instance methods
  addInvoice: (invoice: IInvoice) => Promise<IRegistration>;
  updateInvoiceStatus: (
    invoiceId: string, 
    status: 'pending' | 'paid' | 'cancelled' | 'failed',
    chapaReference?: string
  ) => Promise<IRegistration>;
}

// Static methods
export interface IRegistrationModel extends Model<IRegistration> {
  findByTelegramId(telegramId: number): Promise<IRegistration | null>;
  findWithPendingInvoices(): Promise<IRegistration[]>;
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
