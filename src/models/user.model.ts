import mongoose, { Schema, Document, Model } from 'mongoose';
import { IRegistration } from '../interfaces/user.interface';

interface TransformedUser extends Omit<IRegistration, '_id' | '__v'> {
  id: string;
}

const registrationSchema = new Schema<IRegistration>(
  {
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
        values: ['none', 'beginner', 'intermediate', 'advanced'],
        message: 'Invalid experience level'
      }
    },
    referralSource: {
      type: String,
      trim: true,
      maxlength: [200, 'Referral source must be less than 200 characters']
    },
    telegramData: {
      type: Schema.Types.Mixed,
      default: null
    }
  },
  {
    timestamps: true,
    toJSON: {
  transform(doc, ret): TransformedUser {
    const { _id, __v, ...rest } = ret as IRegistration & { _id: any; __v: number };
    return { 
      ...rest, 
      id: _id.toString() 
    } as TransformedUser;
  }
}

  }
);

// Add index for better query performance
registrationSchema.index({ 'telegramData.id': 1 }, { sparse: true });

const Registration: Model<IRegistration> = mongoose.model<IRegistration>('Registration', registrationSchema);

export { Registration };
