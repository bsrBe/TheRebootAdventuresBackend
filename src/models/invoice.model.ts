import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IInvoice extends Document {
  invoiceId: string;
  user: mongoose.Types.ObjectId;
  event?: mongoose.Types.ObjectId;
  registration?: mongoose.Types.ObjectId;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
  chapaLink: string;
  chapaReference?: string;
  tx_ref: string;
  paidAt?: Date;
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
    chapaLink: {
      type: String,
      required: true
    },
    chapaReference: {
      type: String
    },
    tx_ref: {
      type: String,
      required: true,
      unique: true
    },
    paidAt: {
      type: Date
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
invoiceSchema.index({ tx_ref: 1 }, { unique: true });
invoiceSchema.index({ user: 1 });
invoiceSchema.index({ event: 1 });

const Invoice: Model<IInvoice> = mongoose.model<IInvoice>('Invoice', invoiceSchema);

export { Invoice };
