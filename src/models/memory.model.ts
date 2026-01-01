import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMemory extends Document {
  user: mongoose.Types.ObjectId;
  event: mongoose.Types.ObjectId;
  photoUrl: string;
  caption?: string;
  isApproved: boolean;
  approvedBy?: mongoose.Types.ObjectId;
  telegramFileId?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const memorySchema = new Schema<IMemory>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'Registration',
      required: true
    },
    event: {
      type: Schema.Types.ObjectId,
      ref: 'Event',
      required: true
    },
    photoUrl: {
      type: String,
      required: true
    },
    caption: {
      type: String
    },
    isApproved: {
      type: Boolean,
      default: false
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Registration' // Admin who approved
    },
    telegramFileId: {
      type: String
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
memorySchema.index({ event: 1, isApproved: 1 });
memorySchema.index({ user: 1 });

const Memory: Model<IMemory> = mongoose.model<IMemory>('Memory', memorySchema);

export { Memory };
