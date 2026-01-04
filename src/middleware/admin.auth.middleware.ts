import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Admin, AdminStatus, IAdmin } from '../models/admin.model';

// Define a simplified admin type for request objects
type RequestAdmin = {
  _id: any;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  userType: 'admin';
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
};

// Extend Express Request type with our user property
declare module 'express-serve-static-core' {
  interface Request {
    user?: RequestAdmin;
  }
}

// Type guard for admin
function isAdmin(user: any): user is RequestAdmin {
  return user && user.userType === 'admin' && 'role' in user;
}

export const authenticateAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    // Verify token - use process.env.JWT_SECRET directly to ensure it's read at runtime
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
    
    const admin = await Admin.findById(decoded.id).select('-passwordHash').lean();

    if (!admin || admin.status !== AdminStatus.ACTIVE) {
      return res.status(401).json({ message: 'Token is not valid' });
    }

    // Create a clean admin object with only the properties we need
    const adminObj: RequestAdmin = {
      _id: admin._id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: admin.role,
      status: admin.status,
      userType: 'admin',
      passwordHash: '', // Required by IAdmin but excluded in select
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt
    };
    
    // Set user on request
    req.user = adminObj;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user || !isAdmin(user) || !roles.includes(user.role)) {
      const userRole = user && isAdmin(user) ? user.role : 'unknown';
      return res.status(403).json({ 
        success: false,
        message: `Action not supported for role: ${userRole}` 
      });
    }
    next();
  };
};
