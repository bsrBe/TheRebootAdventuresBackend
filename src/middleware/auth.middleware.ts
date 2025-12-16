import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { IRegistration } from '../interfaces/user.interface';
import { IAdmin } from '../models/admin.model';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Define a base user type that both IAdmin and IRegistration extend
type BaseUser = {
  _id: any;
  email: string;
  userType: 'user' | 'admin';
};

export type RequestUser = (BaseUser & IRegistration) | (BaseUser & IAdmin);

// Type guard for admin
export function isAdmin(user: any): user is RequestUser & { userType: 'admin' } {
  return user && user.userType === 'admin' && 'role' in user;
}

// Type guard for regular user
export function isRegularUser(user: any): user is RequestUser & { userType: 'user' } {
  return user && user.userType === 'user' && 'fullName' in user;
}

// Extend Express Request type with our user property
declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

/**
 * Authentication middleware
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as { id: string; type?: string };
    
    // Check if it's an admin token (usually has type or we check Admin collection)
    // First try to find in Admin collection
    const { Admin } = await import('../models/admin.model');
    const admin = await Admin.findById(decoded.id).lean();
    
    if (admin) {
      req.user = {
        ...admin,
        userType: 'admin'
      } as any;
    } else {
      // If not admin, check regular user
      const { Registration } = await import('../models/user.model');
      const user = await Registration.findById(decoded.id).lean();
      
      if (user) {
        req.user = {
          ...user,
          userType: 'user'
        } as any;
      }
    }

    if (!req.user) {
      return res.status(401).json({ message: 'User not found' });
    }
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ message: 'Token is not valid' });
  }
};

/**
 * Admin middleware (must be used after authenticate)
 */
export const adminOnly = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!isAdmin(req.user)) {
    return res.status(403).json({ message: 'Admin access required' });
  }

  next();
};
