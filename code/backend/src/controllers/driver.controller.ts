import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { driverService } from '../services/driver.service';
import { fareService } from '../services/fare.service';
import { rideService } from '../services/ride.service';
import {
  updateLocationSchema,
  updateDriverStatusSchema,
} from '../validators/driver.validator';
import { completeRideFareSchema } from '../validators/fare.validator';

/**
 * Get authenticated driver profile and vehicle info
 */
export const getDriverProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true,
        driverProfile: true,
      },
    });

    if (!user || !user.driverProfile) {
      throw new AppError('Driver profile not found', 404);
    }

    return res.status(200).json({
      success: true,
      data: {
        profile: user,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get authenticated driver availability and current location
 * Exported as both getDriverAvailability (gurleen) and getAvailability (ayush) below
 */
export const getDriverAvailability = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const availability = await driverService.getAvailabilityAndLocation(userId);

    return res.status(200).json({
      success: true,
      data: {
        availability,
      },
    });
  } catch (error) {
    next(error);
  }
};

/** Alias used by Ayush's routes and tests */
export const getAvailability = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const availability = await driverService.getAvailability(userId);

    return res.status(200).json({
      success: true,
      data: availability,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update driver availability status (with optional coordinates)
 */
export const updateAvailability = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { isAvailable, currentLat, currentLng } = req.body;

    if (typeof isAvailable !== 'boolean') {
      throw new AppError('Field isAvailable must be a boolean', 400);
    }

    let location: { currentLat?: number; currentLng?: number } | undefined = undefined;
    if (currentLat !== undefined || currentLng !== undefined) {
      if (
        typeof currentLat !== 'number' ||
        typeof currentLng !== 'number' ||
        currentLat < -90 ||
        currentLat > 90 ||
        currentLng < -180 ||
        currentLng > 180
      ) {
        throw new AppError('Coordinates must be valid latitude (-90 to 90) and longitude (-180 to 180)', 400);
      }
      location = { currentLat, currentLng };
    }

    const updatedDriver = await driverService.updateAvailability(userId, isAvailable, location);

    return res.status(200).json({
      success: true,
      message: `Driver status updated to ${isAvailable ? 'available' : 'unavailable'}`,
      data: {
        driver: updatedDriver,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get authenticated driver current location
 */
export const getDriverLocation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const location = await driverService.getLocation(userId);

    return res.status(200).json({
      success: true,
      data: {
        ...location,
        location,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update authenticated driver current location coordinates
 * Supports both {currentLat, currentLng} and {lat, lng} / {latitude, longitude}
 */
export const updateLocation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const parsed = updateLocationSchema.parse(req.body);
    const updatedDriver = await driverService.updateLocation(userId, parsed.lat, parsed.lng);

    return res.status(200).json({
      success: true,
      message: 'Driver location updated successfully',
      data: {
        driver: updatedDriver,
      },
    });
  } catch (error) {
    next(error);
  }
};

/** Alias used by Ayush's routes */
export const updateDriverLocation = updateLocation;

/**
 * Update authenticated driver availability and/or current location (combined status endpoint)
 */
export const updateDriverStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const validatedData = updateDriverStatusSchema.parse(req.body);
    const updatedDriver = await driverService.updateStatus(userId, validatedData);

    return res.status(200).json({
      success: true,
      message: 'Driver status updated successfully',
      data: {
        driver: updatedDriver,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get rides assigned to the authenticated driver
 */
export const getDriverRides = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const driver = await prisma.driver.findUnique({
      where: { userId },
    });

    if (!driver) {
      throw new AppError('Driver profile not found', 404);
    }

    const rides = await prisma.ride.findMany({
      where: { driverId: driver.id },
      include: {
        passenger: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        fare: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      success: true,
      data: {
        rides,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Accept a ride that has been matched to the authenticated driver.
 * Only the assigned driver (ride.driverId === driver.id) may accept.
 * Ride status: MATCHED → ACCEPTED. Driver stays unavailable.
 */
export const acceptRide = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const driverUserId = req.user!.id;
    const { id } = req.params;

    const updatedRide = await rideService.acceptRide(id, driverUserId);

    return res.status(200).json({
      success: true,
      message: 'Ride accepted successfully',
      data: {
        ride: updatedRide,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reject a ride that has been matched to the authenticated driver.
 * Only the assigned driver (ride.driverId === driver.id) may reject.
 * Ride status: MATCHED → REQUESTED (cleared driverId, available for re-matching).
 * Driver isAvailable is reset to true.
 */
export const rejectRide = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const driverUserId = req.user!.id;
    const { id } = req.params;

    const updatedRide = await rideService.rejectRide(id, driverUserId);

    return res.status(200).json({
      success: true,
      message: 'Ride rejected. You are now available for new ride requests.',
      data: {
        ride: updatedRide,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Start a ride that the authenticated driver has already accepted.
 * Only the assigned driver (ride.driverId === driver.id) may start.
 * Ride status: ACCEPTED → IN_PROGRESS. Driver remains unavailable.
 */
export const startRide = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const driverUserId = req.user!.id;
    const { id } = req.params;

    const updatedRide = await rideService.startRide(id, driverUserId);

    return res.status(200).json({
      success: true,
      message: 'Ride started successfully',
      data: {
        ride: updatedRide,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Complete a ride: calculate and persist the final fare, set status to COMPLETED.
 * Formula: BaseFare + (distanceKm × RatePerKm)
 * Only the driver assigned to the ride may complete it.
 */
export const completeRide = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const driverUserId = req.user!.id;
    const { distanceKm } = req.body && Object.keys(req.body).length > 0
      ? completeRideFareSchema.parse(req.body)
      : { distanceKm: undefined };

    const result = await fareService.completeFare(id, driverUserId, distanceKm);

    return res.status(200).json({
      success: true,
      message: 'Ride completed successfully',
      data: {
        ride: result.ride || result,
        fare: result.fare,
      },
    });
  } catch (error) {
    next(error);
  }
};
