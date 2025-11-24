import mongoose, { Schema, Document, Model } from 'mongoose';
import { IRegistration, IInvoice, ITelegramData, IRegistrationModel } from '../interfaces/user.interface';

// Define the schema for the Telegram data
const telegramDataSchema = new Schema<ITelegramData>({
  id: { type: Number, required: true },
  chatId: { type: Schema.Types.Mixed, required: false },
  first_name: { type: String },
  last_name: { type: String },
  username: { type: String },
  language_code: { type: String },
  is_bot: { type: Boolean },
  last_activity: { type: Date, default: Date.now },
  is_subscribed: { type: Boolean, default: true },
  photo_url: { type: String }
}, { _id: false });

// Define the schema for invoices
const invoiceSchema = new Schema<IInvoice>({
  _id: { type: Schema.Types.ObjectId, auto: true },
  invoiceId: { 
    type: String, 
    required: true,
    unique: true
  },
  eventName: { 
    type: String, 
    required: true,
    trim: true
  },
  amount: { 
    type: Number, 
    required: true,
    min: 0
  },
  place: { 
    type: String, 
    required: true,
    trim: true
  },
  time: { 
    type: Date, 
    required: true
  },
  chapaLink: { 
    type: String, 
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'paid', 'cancelled', 'failed'],
    default: 'pending'
  },
  chapaReference: {
    type: String,
    sparse: true
  },
  paidAt: {
    type: Date,
    default: null
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, { timestamps: true, _id: false });

// Main registration schema
const registrationSchema = new Schema<IRegistration>(
  {
    _id: { type: Schema.Types.ObjectId, auto: true },
    id: { type: String, required: false },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      minlength: [2, 'Full name must be at least 2 characters'],
      maxlength: [100, 'Full name must be less than 100 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
      maxlength: [255, 'Email must be less than 255 characters'],
      unique: true
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      match: [/^\+251\d{9}$/, 'Phone number must be in format +251XXXXXXXXX'],
      unique: true
    },
    age: {
      type: Number,
      required: [true, 'Age is required'],
      min: [18, 'Age must be at least 18'],
      max: [60, 'Age must be at most 60']
    },
    weight: {
      type: Number,
      required: [true, 'Weight is required'],
      min: [35, 'Weight must be at least 35 kg'],
      max: [100, 'Weight must be at most 100 kg']
    },
    height: {
      type: Number,
      required: [true, 'Height is required'],
      min: [100, 'Height must be at least 100 cm'],
      max: [250, 'Height must be at most 250 cm']
    },
    horseRidingExperience: {
      type: String,
      required: [true, 'Horse riding experience is required'],
      enum: {
        values: ['beginner', 'intermediate', 'advanced'],
        message: 'Horse riding experience must be one of: beginner, intermediate, advanced'
      }
    },
    referralSource: {
      type: String,
      required: [true, 'Referral source is required'],
      trim: true
    },
    telegramData: {
      type: telegramDataSchema,
      default: null
    },
    registeredEvents: [{
      eventId: { type: Schema.Types.ObjectId, ref: 'Event' },
      eventName: String,
      registrationDate: { type: Date, default: Date.now },
      status: { 
        type: String, 
        enum: ['registered', 'payment_initiated', 'paid', 'cancelled'],
        default: 'registered'
      }
    }],
    invoices: {
      type: [invoiceSchema],
      default: []
    },
    isAdmin: {
      type: Boolean,
      default: false
    },
    // Removed event and paymentStatus as they are now handled by invoices
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        // Create a new object with the properties we want to keep
        const { _id, __v, ...rest } = ret;
        
        // Return the transformed object with id instead of _id
        return {
          ...rest,
          ...(_id && { id: _id.toString() })
        };
      }
    }
  }
);

// Indexes
registrationSchema.index({ 'telegramData.id': 1 }, { sparse: true });
registrationSchema.index({ event: 1 });
registrationSchema.index({ paymentStatus: 1 });

// Add instance methods
registrationSchema.methods.addInvoice = async function(invoice: IInvoice): Promise<IRegistration> {
  this.invoices.push(invoice);
  return this.save();
};

registrationSchema.methods.updateInvoiceStatus = async function(
  invoiceId: string, 
  status: 'pending' | 'paid' | 'cancelled' | 'failed',
  chapaReference?: string
): Promise<IRegistration> {
  const invoice = this.invoices.find((inv: IInvoice) => inv.invoiceId === invoiceId);
  if (!invoice) {
    throw new Error('Invoice not found');
  }
  
  invoice.status = status;
  if (status === 'paid') {
    invoice.paidAt = new Date();
  }
  if (chapaReference) {
    invoice.chapaReference = chapaReference;
  }
  
  return this.save();
};

// Add static methods
registrationSchema.statics.findByTelegramId = async function(telegramId: number): Promise<IRegistration | null> {
  return this.findOne({ 'telegramData.id': telegramId });
};

registrationSchema.statics.findWithPendingInvoices = async function(): Promise<IRegistration[]> {
  return this.find({ 'invoices.status': 'pending' });
};

// Create and export the model
const Registration = mongoose.model<IRegistration, IRegistrationModel>('Registration', registrationSchema);

export { Registration };
