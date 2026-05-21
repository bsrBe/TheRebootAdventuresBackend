import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { Logger } from '../utils/logger';

const log = Logger.createLogger('ErrorMiddleware');

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

/**
 * Global error handler middleware
 * Handles both AppError instances and unexpected errors
 */
export const errorHandler = (
  error: Error | AppError | IError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Handle custom AppError instances
  if (error instanceof AppError) {
    log.warn('Application error', {
      code: error.code,
      message: error.message,
      path: req.path,
      method: req.method,
      statusCode: error.statusCode,
    });

    return res.status(error.statusCode).json({
      success: false,
      code: error.code,
      message: error.message,
      ...(process.env.NODE_ENV === 'development' && { details: error.details }),
    });
  }

  const err = error as IError;
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Handle MongoDB duplicate field errors
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    const value = err.keyValue ? err.keyValue[field] : 'unknown';
    const message = `Duplicate field value: ${value}. Please use another value!`;
    
    log.warn('Duplicate field error', { field, value, path: req.path });
    
    return res.status(400).json({
      success: false,
      message,
      code: 'DUPLICATE_FIELD',
      error: { field, value },
    });
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors || {}).map((el: any) => ({
      field: el.path,
      message: el.message,
      code: 'VALIDATION_ERROR',
    }));

    log.warn('Validation error', { errors, path: req.path });

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    log.warn('JWT error', { message: err.message, path: req.path });
    return res.status(401).json({
      success: false,
      message: 'Invalid token. Please log in again!',
      code: 'INVALID_TOKEN',
    });
  }

  if (err.name === 'TokenExpiredError') {
    log.warn('Token expired', { path: req.path });
    return res.status(401).json({
      success: false,
      message: 'Your token has expired! Please log in again.',
      code: 'TOKEN_EXPIRED',
    });
  }

  // Handle CastError (invalid MongoDB ID format)
  if (err.name === 'CastError') {
    const message = `Invalid ${err.path}: ${err.value}`;
    log.warn('Cast error', { path: err.path, value: err.value, requestPath: req.path });
    return res.status(400).json({
      success: false,
      message,
      code: 'INVALID_INPUT',
    });
  }

  // Unexpected errors
  log.error('Unexpected error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Development error response
  if (process.env.NODE_ENV === 'development') {
    return res.status(err.statusCode || 500).json({
      success: false,
      status: err.status,
      error: err,
      message: err.message,
      stack: err.stack,
    });
  }

  // Production error response
  if (err.isOperational) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message,
    });
  }

  // Unknown error - don't leak error details
  return res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    code: 'INTERNAL_SERVER_ERROR',
  });
};

// Handle uncaught errors
export const handleProcessErrors = (server: any) => {
  process.on('unhandledRejection', (err: IError) => {
    log.error('Unhandled rejection', { name: err.name, message: err.message });

    if (server) {
      server.close(() => {
        process.exit(1);
      });
    } else {
      process.exit(1);
    }
  });

  process.on('uncaughtException', (err: IError) => {
    log.error('Uncaught exception', { name: err.name, message: err.message });

    if (server) {
      server.close(() => {
        process.exit(1);
      });
    } else {
      process.exit(1);
    }
  });
};
