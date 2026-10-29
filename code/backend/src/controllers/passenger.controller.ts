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
import { realtimeService } from '../services/realtime.service';
import {
  createFeedbackSchema,
  rideHistoryQuerySchema,
  rideHistoryFilterSchema,
} from '../validators/feedback.validator';
import { idParamSchema, rideFilterQuerySchema } from '../validators/common.validator';

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
    const { status } = rideFilterQuerySchema.parse(req.query || {});
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
 * Get completed ride history for the authenticated passenger with filtering & search (Task #19 & #41)
 */
export const getPassengerRideHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const passengerId = req.user!.id;
    const parsedQuery = rideHistoryFilterSchema.parse(req.query || {});
    const rides = await rideService.getPassengerRideHistory(passengerId, parsedQuery);

    return res.status(200).json({
      success: true,
      data: {
        rides,
        count: rides.length,
        filters: parsedQuery,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Stream real-time ride status events for the authenticated passenger (Task #42)
 */
export const streamPassengerRideEvents = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const passengerId = req.user!.id;
    const rideId = req.params.id || (req.query.rideId as string) || undefined;
    const clientId = `p-${passengerId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    realtimeService.registerClient({
      id: clientId,
      role: 'PASSENGER',
      userId: passengerId,
      rideId,
      res,
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
    const { id } = idParamSchema.parse(req.params);
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
    const { id } = idParamSchema.parse(req.params);
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
 * Get active ride for the authenticated passenger (Task 40)
 */
export const getActiveRide = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const passengerId = req.user!.id;
    const activeRide = await rideService.getActiveRideForPassenger(passengerId);

    return res.status(200).json({
      success: true,
      data: {
        ride: activeRide,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Request a ride for the authenticated passenger.
 *
 * Flow:
 *  1. Validate input and coordinate active rides (reject if active ride exists).
 *  2. Create the ride record with status REQUESTED.
 *  3. Search for available drivers with location-based search and concurrent retry.
 *  4. Return the final ride state.
 */
export const requestRide = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const passengerId = req.user!.id;
    const validatedData = createRideSchema.parse(req.body);

    // Create the ride record with status REQUESTED
    const ride = await rideService.createRide(passengerId, validatedData);

    return res.status(201).json({
      success: true,
      message: 'Ride requested successfully',
      data: {
        ride,
        matched: false,
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
    const { id } = idParamSchema.parse(req.params);
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
 * Task 43: Get real-time ride tracking telemetry using periodic driver location updates
 */
export const getRideTracking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const passengerId = req.user!.id;
    const trackingInfo = await rideService.getRideTracking(id, passengerId);

    return res.status(200).json({
      success: true,
      data: trackingInfo,
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
    const { id } = idParamSchema.parse(req.params);
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
    const { id } = idParamSchema.parse(req.params);
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
    const { id } = idParamSchema.parse(req.params);
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

/**
 * Cancel an active ride for the authenticated passenger
 */
export const cancelRide = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const userId = req.user!.id;
    const cancelledRide = await rideService.cancelRide(id, userId);

    return res.status(200).json({
      success: true,
      message: 'Ride cancelled successfully',
      data: {
        ride: cancelledRide,
      },
    });
  } catch (error) {
    next(error);
  }
};

