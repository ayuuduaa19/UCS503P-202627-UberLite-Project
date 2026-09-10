import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

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
 * Request a ride for the authenticated passenger
 */
export const requestRide = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const passengerId = req.user!.id;
    const { pickupLat, pickupLng, pickupAddress, dropoffLat, dropoffLng, dropoffAddress } = req.body;

    if (!pickupAddress || !dropoffAddress) {
      throw new AppError('Pickup and dropoff addresses are required', 400);
    }

    const ride = await prisma.ride.create({
      data: {
        passengerId,
        pickupLat: typeof pickupLat === 'number' ? pickupLat : 0.0,
        pickupLng: typeof pickupLng === 'number' ? pickupLng : 0.0,
        pickupAddress,
        dropoffLat: typeof dropoffLat === 'number' ? dropoffLat : 0.0,
        dropoffLng: typeof dropoffLng === 'number' ? dropoffLng : 0.0,
        dropoffAddress,
        status: 'REQUESTED',
      },
    });

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
