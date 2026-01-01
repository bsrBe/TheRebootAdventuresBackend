import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IEventRegistration extends Document {
  user: mongoose.Types.ObjectId;
  event: mongoose.Types.ObjectId;
  registrationDate: Date;
  status: 'registered' | 'payment_initiated' | 'confirmed' | 'cancelled';
  priceAtRegistration?: number;
  checkedIn: boolean;
  checkedInAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const eventRegistrationSchema = new Schema<IEventRegistration>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'Registration', // Referring to the User model (which is named Registration currently)
      required: true
    },
    event: {
      type: Schema.Types.ObjectId,
      ref: 'Event',
      required: true
    },
    registrationDate: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['registered', 'payment_initiated', 'confirmed', 'cancelled'],
      default: 'registered'
    },
    priceAtRegistration: {
      type: Number
    },
    checkedIn: {
      type: Boolean,
      default: false
    },
    checkedInAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

// Indexes
eventRegistrationSchema.index({ event: 1, status: 1 });
eventRegistrationSchema.index({ user: 1 });
eventRegistrationSchema.index({ user: 1, event: 1 }, { unique: true }); // Prevent double registration

const EventRegistration: Model<IEventRegistration> = mongoose.model<IEventRegistration>('EventRegistration', eventRegistrationSchema);

export { EventRegistration };
