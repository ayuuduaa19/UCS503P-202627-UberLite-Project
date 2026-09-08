import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this);
  }
}

export const notFoundHandler = (req: Request, res: Response, _next: NextFunction) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Route not found: ${req.method} ${req.originalUrl}`,
      statusCode: 404,
    },
  });
};

export const errorHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const statusCode = 'statusCode' in err && typeof err.statusCode === 'number' ? err.statusCode : 500;
  const message = err.message || 'Internal Server Error';

  if (config.isDevelopment) {
    console.error(`[Error] ${statusCode} - ${message}\n`, err.stack);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      statusCode,
      ...(config.isDevelopment && { stack: err.stack }),
    },
  });
};
