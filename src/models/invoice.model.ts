import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IInvoice extends Document {
  invoiceId: string;
  user: mongoose.Types.ObjectId;
  event?: mongoose.Types.ObjectId;
  registration?: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
  transactionId?: string; // Telebirr Transaction ID (e.g., CL69OU8FEN)
  paidAt?: Date;
  receiptData?: {
    senderName?: string;
    confirmedAmount?: number;
    date?: string;
    receiver?: string;
  };
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const invoiceSchema = new Schema<IInvoice>(
  {
    invoiceId: {
      type: String,
      required: true,
      unique: true
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'Registration',
      required: true
    },
    event: {
      type: Schema.Types.ObjectId,
      ref: 'Event'
    },
    registration: {
      type: Schema.Types.ObjectId,
      ref: 'EventRegistration'
    },
    amount: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: 'ETB'
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'cancelled'],
      default: 'pending'
    },
    transactionId: {
      type: String,
      unique: true,
      sparse: true // Allows null/undefined values to exist without violating uniqueness
    },
    paidAt: {
      type: Date
    },
    receiptData: {
      senderName: String,
      confirmedAmount: Number,
      date: String,
      receiver: String
    },
    metadata: {
      type: Schema.Types.Mixed
    }
  },
  {
    timestamps: true
  }
);

// Indexes
invoiceSchema.index({ invoiceId: 1 }, { unique: true });
invoiceSchema.index({ transactionId: 1 }, { unique: true, sparse: true });
invoiceSchema.index({ user: 1 });
invoiceSchema.index({ event: 1 });

const Invoice: Model<IInvoice> = mongoose.model<IInvoice>('Invoice', invoiceSchema);

export { Invoice };
