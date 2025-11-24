import { IRegistration } from '../interfaces/user.interface';
import { IAdmin } from '../models/admin.model';

// Simplified user type for request objects
type BaseUser = {
  _id: any;
  email: string;
};

// Union type for request user
export type RequestUser = 
  | (BaseUser & { userType: 'user' } & Omit<IRegistration, keyof Document>)
  | (BaseUser & { userType: 'admin' } & Omit<IAdmin, keyof Document>);

// Type guard for admin
export function isAdmin(user: any): user is RequestUser & { userType: 'admin' } {
  return user && user.userType === 'admin' && 'role' in user;
}

// Type guard for regular user
export function isRegularUser(user: any): user is RequestUser & { userType: 'user' } {
  return user && user.userType === 'user' && 'fullName' in user;
}
