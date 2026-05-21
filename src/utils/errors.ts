export enum ErrorCode {
  // Client errors (4xx)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  BAD_REQUEST = 'BAD_REQUEST',

  // Server errors (5xx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // Business logic errors
  PAYMENT_VERIFICATION_FAILED = 'PAYMENT_VERIFICATION_FAILED',
  INVOICE_NOT_FOUND = 'INVOICE_NOT_FOUND',
  INVALID_TRANSACTION = 'INVALID_TRANSACTION',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  EVENT_NOT_FOUND = 'EVENT_NOT_FOUND',
}

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly message: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(ErrorCode.BAD_REQUEST, message, 400, details);
  }

  static validationError(message: string, details?: unknown): AppError {
    return new AppError(ErrorCode.VALIDATION_ERROR, message, 400, details);
  }

  static unauthorized(message: string = 'Unauthorized'): AppError {
    return new AppError(ErrorCode.UNAUTHORIZED, message, 401);
  }

  static forbidden(message: string = 'Forbidden'): AppError {
    return new AppError(ErrorCode.FORBIDDEN, message, 403);
  }

  static notFound(resource: string): AppError {
    return new AppError(ErrorCode.NOT_FOUND, `${resource} not found`, 404);
  }

  static conflict(message: string): AppError {
    return new AppError(ErrorCode.CONFLICT, message, 409);
  }

  static internal(message: string, details?: unknown): AppError {
    return new AppError(ErrorCode.INTERNAL_ERROR, message, 500, details);
  }

  static paymentError(message: string): AppError {
    return new AppError(ErrorCode.PAYMENT_VERIFICATION_FAILED, message, 400);
  }
}
