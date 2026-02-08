import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

/**
 * Global API error handler — consistent JSON responses.
 */
export function errorHandler(
  err: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  const message = err.message || 'Internal server error';

  if (statusCode >= 500) {
    logger.error('API', message, { stack: err.stack });
  } else {
    logger.warn('API', message);
  }

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && err.stack && { stack: err.stack })
  });
}

/**
 * Async route wrapper — catches errors and forwards to errorHandler.
 */
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
