import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { rideService } from '../services/ride.service';
import { matchingService } from '../services/matching.service';
import { fareService } from '../services/fare.service';
import { createRideSchema } from '../validators/ride.validator';
import {
  matchingOptionsSchema,
  findNearbyDriversSchema,
  assignDriverSchema,
} from '../validators/matching.validator';
import { estimateFareFromLocationsSchema } from '../validators/fare.validator';

import { feedbackService } from '../services/feedback.service';
import { createFeedbackSchema, rideHistoryQuerySchema } from '../validators/feedback.validator';

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
 * Get all rides or filtered rides for the authenticated passenger
 */
export const getPassengerRides = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const passengerId = req.user!.id;
    const status = req.query.status as any;
    const rides = await rideService.getPassengerRides(passengerId, status);

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
 * Get completed ride history for the authenticated passenger (Task #19)
 */
export const getPassengerRideHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const passengerId = req.user!.id;
    const parsedQuery = rideHistoryQuerySchema.parse(req.query);
    const rides = await rideService.getPassengerRideHistory(passengerId, parsedQuery.status);

    return res.status(200).json({
      success: true,
      data: {
        rides,
        count: rides.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Submit post-ride rating and optional feedback for a completed ride (Task #20)
 */
export const submitRideFeedback = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const passengerUserId = req.user!.id;
    const validatedData = createFeedbackSchema.parse(req.body);

    const feedback = await feedbackService.submitRideFeedback(
      id,
      passengerUserId,
      validatedData
    );

    return res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully',
      data: {
        feedback,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get feedback for a specific ride
 */
export const getRideFeedback = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const requestingUserId = req.user!.id;

    const feedbacks = await feedbackService.getRideFeedback(id, requestingUserId);

    return res.status(200).json({
      success: true,
      data: {
        feedbacks,
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

    let nearestDriver: any = null;
    try {
      nearestDriver = await matchingService.findNearestDriver({ lat: pickupLat, lng: pickupLng });
    } catch (err: any) {
      nearestDriver = null;
    }

    if (!nearestDriver) {
      // No driver available — return the ride in REQUESTED state.
      return res.status(201).json({
        success: true,
        message: 'Ride requested successfully',
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
/**
 * Get estimated fare for a ride using pickup/dropoff coordinates and vehicle type
 * Formula: BaseFare + (distanceKm × RatePerKm)
 */
export const estimateRideFare = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const fareEstimate = await fareService.estimateFareForRide(id);

    return res.status(200).json({
      success: true,
      data: {
        fareEstimate,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Calculate estimated fare directly from ride locations (pickup/dropoff coordinates)
 * Formula: BaseFare + (distanceKm × RatePerKm)
 */
export const estimateFare = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = estimateFareFromLocationsSchema.parse(req.body);
    const fareEstimate = fareService.estimateFareFromLocations(
      { lat: input.pickupLat, lng: input.pickupLng },
      { lat: input.dropoffLat, lng: input.dropoffLng },
      input.vehicleType
    );

    return res.status(200).json({
      success: true,
      message: 'Fare estimated successfully',
      data: {
        fareEstimate,
      },
    });
  } catch (error) {
    next(error);
  }
};

