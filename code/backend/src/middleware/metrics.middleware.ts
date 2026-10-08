import { Request, Response, NextFunction } from 'express';
import { metricsCollector } from '../utils/metricsCollector';

/**
 * Lightweight middleware that measures API response time,
 * injects the `X-Response-Time` header, and records request telemetry.
 */
export const responseTimeMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const startTime = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(startTime);
    const durationMs = diff[0] * 1000 + diff[1] / 1e6;

    try {
      // Set header if not already written (though on finish it may already be sent)
      if (!res.headersSent) {
        res.setHeader('X-Response-Time', `${durationMs.toFixed(2)}ms`);
      }
    } catch {
      // Ignore header errors if already sent
    }

    // Normalized route pattern if matched by Express router, otherwise path
    const routePattern = (req.baseUrl || '') + (req.route?.path || req.path || '/');

    metricsCollector.recordRequest(
      req.method,
      req.path || '/',
      routePattern,
      res.statusCode,
      durationMs
    );
  });

  next();
};
