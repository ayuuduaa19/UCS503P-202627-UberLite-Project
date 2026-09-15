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

/**
 * Get authenticated passenger profile
 */
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

/**
 * Get ride history for the authenticated passenger
 */
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
 * Request a ride for the authenticated passenger.
 *
 * Flow (Task 13):
 *  1. Validate input and create the ride record with status REQUESTED.
 *  2. Run the driver-matching algorithm to find the nearest available driver.
 *  3. If a driver is found:
 *       a. Update the ride with the matched driverId and status MATCHED.
 *          The `updatedAt` timestamp acts as the assignment timestamp.
 *       b. Mark the driver as unavailable to prevent double-booking.
 *  4. Return the final ride state (with driver info when matched).
 */
export const requestRide = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const passengerId = req.user!.id;
    const validatedData = createRideSchema.parse(req.body);

    // Step 1: Persist the initial ride record via rideService.
    const ride = await rideService.createRide(passengerId, validatedData);

    // Step 2: Search for the best available driver via the matching module.
    const pickupLat = typeof validatedData.pickupLat === 'number' ? validatedData.pickupLat : 0.0;
    const pickupLng = typeof validatedData.pickupLng === 'number' ? validatedData.pickupLng : 0.0;

    const nearestDriver = await matchingService.findNearestDriver({ lat: pickupLat, lng: pickupLng });

    if (!nearestDriver) {
      // No driver available — return the ride in REQUESTED state.
      return res.status(201).json({
        success: true,
        message: 'Ride requested. No driver is currently available — please try again shortly.',
        data: {
          ride,
          matched: false,
        },
      });
    }

    // Step 3: Match and record the driver using the full matching service
    //         (runs inside a Prisma transaction with double-booking protection).
    const matchResult = await matchingService.matchDriverForRide(ride.id, {}, passengerId);

    return res.status(201).json({
      success: true,
      message: 'Ride requested and driver matched successfully',
      data: {
        ride: matchResult.ride,
        matched: true,
        matchedAt: matchResult.ride.updatedAt,
        matchedDriver: matchResult.matchedDriver,
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
