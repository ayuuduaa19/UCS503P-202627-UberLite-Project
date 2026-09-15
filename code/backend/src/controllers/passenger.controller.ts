import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { matchingService } from '../services/matching.service';

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

    const rides = await prisma.ride.findMany({
      where: { passengerId },
      include: {
        driver: {
          select: {
            id: true,
            vehicleType: true,
            vehicleModel: true,
            vehiclePlate: true,
            rating: true,
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
 * Request a ride for the authenticated passenger.
 *
 * Flow:
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
    const { pickupLat, pickupLng, pickupAddress, dropoffLat, dropoffLng, dropoffAddress } = req.body;

    if (!pickupAddress || !dropoffAddress) {
      throw new AppError('Pickup and dropoff addresses are required', 400);
    }

    const resolvedPickupLat = typeof pickupLat === 'number' ? pickupLat : 0.0;
    const resolvedPickupLng = typeof pickupLng === 'number' ? pickupLng : 0.0;

    // Step 1: Persist the initial ride record.
    const ride = await prisma.ride.create({
      data: {
        passengerId,
        pickupLat: resolvedPickupLat,
        pickupLng: resolvedPickupLng,
        pickupAddress,
        dropoffLat: typeof dropoffLat === 'number' ? dropoffLat : 0.0,
        dropoffLng: typeof dropoffLng === 'number' ? dropoffLng : 0.0,
        dropoffAddress,
        status: 'REQUESTED',
      },
    });

    // Step 2: Search for the best available driver via the matching module.
    const match = await matchingService.findAvailableDriver(resolvedPickupLat, resolvedPickupLng);

    if (!match) {
      // No driver available — return the ride in REQUESTED state so the
      // client knows to retry or wait.
      return res.status(201).json({
        success: true,
        message: 'Ride requested. No driver is currently available — please try again shortly.',
        data: {
          ride,
          matched: false,
        },
      });
    }

    // Step 3a: Record the selected driver and mark the ride as MATCHED.
    //          `updatedAt` is automatically set by Prisma and serves as the
    //          assignment timestamp.
    const matchedRide = await prisma.ride.update({
      where: { id: ride.id },
      data: {
        driverId: match.driverId,
        status: 'MATCHED',
      },
      include: {
        driver: {
          select: {
            id: true,
            vehicleType: true,
            vehicleModel: true,
            vehiclePlate: true,
            vehicleColor: true,
            rating: true,
            user: {
              select: {
                name: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    // Step 3b: Mark the driver unavailable to prevent double-assignment.
    await matchingService.markDriverUnavailable(match.driverId);

    return res.status(201).json({
      success: true,
      message: 'Ride requested and driver matched successfully',
      data: {
        ride: matchedRide,
        matched: true,
        matchedAt: matchedRide.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};
