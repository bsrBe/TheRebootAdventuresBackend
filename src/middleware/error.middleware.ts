import { Request, Response, NextFunction } from 'express';

export interface IError extends Error {
  statusCode?: number;
  status?: string;
  isOperational?: boolean;
  code?: number;
  keyValue?: any;
  errors?: any;
  path?: string;
  value?: string;
}

export const errorHandler = (
  err: IError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Handle duplicate field errors
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    const value = err.keyValue ? err.keyValue[field] : 'unknown';
    const message = `Duplicate field value: ${value}. Please use another value!`;
    return res.status(400).json({
      success: false,
      message,
      error: {
        field,
        value,
        code: 'DUPLICATE_FIELD'
      }
    });
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors || {}).map((el: any) => ({
      field: el.path,
      message: el.message,
      code: 'VALIDATION_ERROR'
    }));
    
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token. Please log in again!',
      code: 'INVALID_TOKEN'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Your token has expired! Please log in again.',
      code: 'TOKEN_EXPIRED'
    });
  }

  // Handle CastError (invalid MongoDB ID format, etc.)
  if (err.name === 'CastError') {
    const message = `Invalid ${err.path}: ${err.value}`;
    return res.status(400).json({
      success: false,
      message,
      code: 'INVALID_INPUT'
    });
  }

  // Development error handling
  if (process.env.NODE_ENV === 'development') {
    console.error('Error 💥', err);
    return res.status(err.statusCode || 500).json({
      success: false,
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack
    });
  }

  // Production error handling
  if (process.env.NODE_ENV === 'production') {
    // Operational, trusted error: send message to client
    if (err.isOperational) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message
      });
    }

    // Programming or other unknown error: don't leak error details
    console.error('ERROR 💥', err);
    return res.status(500).json({
      success: false,
      message: 'Something went very wrong!',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }

  next();
};

// Export a function to handle uncaught exceptions and unhandled rejections
export const handleProcessErrors = (server: any) => {
  // Catch unhandled promise rejections
  process.on('unhandledRejection', (err: IError) => {
    console.error('UNHANDLED REJECTION! 💥 Shutting down...');
    console.error(err.name, err.message);
    
    // Close server & exit process
    if (server) {
      server.close(() => {
        process.exit(1);
      });
    } else {
      process.exit(1);
    }
  });

  // Catch uncaught exceptions
  process.on('uncaughtException', (err: IError) => {
    console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
    console.error(err.name, err.message);
    
    // Close server & exit process
    if (server) {
      server.close(() => {
        process.exit(1);
      });
    } else {
      process.exit(1);
    }
  });
};
