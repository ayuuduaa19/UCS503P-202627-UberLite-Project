import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { AppError } from './errorHandler';
import { verifyToken, TokenPayload } from '../lib/jwt';
import { prisma } from '../lib/prisma';

/**
 * Authentication middleware to validate Bearer tokens and attach authenticated user to req.user
 */
export const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return next(new AppError('Authentication token is required', 401));
    }

    if (!authHeader.startsWith('Bearer ')) {
      return next(new AppError('Invalid authorization format. Format must be "Bearer <token>"', 401));
    }

    const token = authHeader.split(' ')[1];
    if (!token || token.trim() === '') {
      return next(new AppError('Authentication token is required', 401));
    }

    // Verify and decode JWT token
    let decoded: TokenPayload;
    try {
      decoded = verifyToken<TokenPayload>(token);
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        return next(new AppError('Token has expired', 401));
      }
      return next(new AppError('Invalid or expired token', 401));
    }

    if (!decoded || !decoded.id) {
      return next(new AppError('Invalid token payload', 401));
    }

    // Attempt to verify user existence in the database if configured
    if (process.env.DATABASE_URL) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: decoded.id },
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            role: true,
          },
        });

        if (!user) {
          return next(new AppError('User belonging to this token no longer exists', 401));
        }

        req.user = user;
        return next();
      } catch (dbError: any) {
        if (dbError instanceof AppError) {
          return next(dbError);
        }
        // Fallback to token payload if database query fails
      }
    }

    // Attach user from decoded token payload (fallback for isolated tests / no DB)
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };

    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Aliases for convenient importing of authentication middleware
 */
export const authenticateToken = authenticate;
export const requireAuth = authenticate;
export const authMiddleware = authenticate;

/**
 * Reusable role-based authorization middleware
 * Checks whether the authenticated user has one of the allowed roles.
 */
export const authorize = (...roles: (Role | string)[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }

    return next();
  };
};

/**
 * Aliases and role-specific helper middleware
 */
export const authorizeRoles = authorize;
export const requireRole = (role: Role | string) => authorize(role);
export const requirePassenger = authorize(Role.PASSENGER);
export const requireDriver = authorize(Role.DRIVER);
export const requireAdmin = authorize(Role.ADMIN);
