import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { rideService } from '../services/ride.service';
import { matchingService } from '../services/matching.service';
import { createRideSchema } from '../validators/ride.validator';
import {
  matchingOptionsSchema,
  findNearbyDriversSchema,
  assignDriverSchema,
} from '../validators/matching.validator';

export const getPassengerProfile = async (req: Request, res: Response, next: NextFunction) => {
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
      },
    });

    if (!user) {
      throw new AppError('Passenger profile not found', 404);
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

export const getPassengerRides = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const passengerId = req.user!.id;
    const rides = await rideService.getPassengerRides(passengerId);

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
 * Request / create a new ride for the authenticated passenger
 */
export const requestRide = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const passengerId = req.user!.id;
    const validatedData = createRideSchema.parse(req.body);
    const ride = await rideService.createRide(passengerId, validatedData);

    return res.status(201).json({
      success: true,
      message: 'Ride requested successfully',
      data: {
        ride,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get ride details by ride ID
 */
export const getRideDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const ride = await rideService.getRideById(id);

    return res.status(200).json({
      success: true,
      data: {
        ride,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Find and match the nearest available driver to an existing ride
 */
export const matchRideWithDriver = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const passengerId = req.user!.id;
    const options = matchingOptionsSchema.parse(req.body || {});

    const result = await matchingService.matchDriverForRide(id, options, passengerId);

    return res.status(200).json({
      success: true,
      message: 'Driver matched and assigned successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Assign a specific available driver to a ride, preventing assignment to unavailable drivers
 */
export const assignRideDriver = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const passengerId = req.user!.id;
    const { driverId } = assignDriverSchema.parse(req.body);

    const result = await matchingService.assignDriverToRide(id, driverId, passengerId);

    return res.status(200).json({
      success: true,
      message: 'Driver assigned successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Find nearby available drivers based on pickup coordinates
 */
export const getNearbyDrivers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = findNearbyDriversSchema.parse(req.body);
    const drivers = await matchingService.findAvailableDrivers(
      { lat: input.pickupLat, lng: input.pickupLng },
      {
        maxRadiusKm: input.maxRadiusKm,
        vehicleType: input.vehicleType,
        limit: input.limit,
      }
    );

    return res.status(200).json({
      success: true,
      data: {
        drivers,
        count: drivers.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

