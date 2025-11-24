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
    // Get token from header
    // const authHeader = req.headers.authorization;
    // console.log("authHeader", authHeader);
    // if (!authHeader || !authHeader.startsWith('Bearer ')) {
    //   return res.status(401).json({ message: 'No token, authorization denied' });
    // }

    // const token = authHeader.split(' ')[1];
    // if (!token) {
    //   return res.status(401).json({ message: 'No token, authorization denied' });
    // }

    // // Verify token
    // const decoded = jwt.verify(token, JWT_SECRET) as { id: string; type: 'user' | 'admin' };
    // console.log("decoded", decoded);
    // if (decoded.type === 'admin') {
    //   const { Admin } = await import('../models/admin.model');
    //   const admin = await Admin.findById(decoded.id).lean();
    //   if (admin) {
    //     // Cast to any to bypass type checking for now
    //     req.user = {
    //       ...admin,
    //       userType: 'admin'
    //     } as any;
    //   }
    //   console.log("admin",req.user);
    // } else {
    //   const { Registration } = await import('../models/user.model');
    //   const user = await Registration.findById(decoded.id).lean();
    //   if (user) {
    //     // Cast to any to bypass type checking for now
    //     req.user = {
    //       ...user,
    //       userType: 'user'
    //     } as any;
    //     console.log("user",req.user);
    //   }
    // }
    // console.log("req.user",req.user);
    // if (!req.user) {
    //   return res.status(401).json({ message: 'Token is not valid' });
    // }

    // // Attach user to the request object
    // next();
    const authHeader = req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const token = authHeader.split(' ')[1];
    console.log('authHeader', authHeader);
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
    console.log('decoded', decoded);
    
    // Add user from payload
    req.user = decoded;
    console.log('req.user', req.user); // Should show the decoded user
    
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
