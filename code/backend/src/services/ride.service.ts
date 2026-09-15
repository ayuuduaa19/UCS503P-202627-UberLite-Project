import { RideStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { CreateRideInput } from '../validators/ride.validator';

export class RideService {
  /**
   * Create a new ride request for an authenticated passenger
   */
  async createRide(passengerId: string, input: CreateRideInput) {
    if (!passengerId) {
      throw new AppError('Passenger ID is required', 400);
    }

    const ride = await prisma.ride.create({
      data: {
        passengerId,
        pickupAddress: input.pickupAddress,
        dropoffAddress: input.dropoffAddress,
        pickupLat: input.pickupLat ?? 0.0,
        pickupLng: input.pickupLng ?? 0.0,
        dropoffLat: input.dropoffLat ?? 0.0,
        dropoffLng: input.dropoffLng ?? 0.0,
        distanceKm: input.distanceKm ?? null,
        durationMin: input.durationMin ?? null,
        status: RideStatus.REQUESTED,
      },
      include: {
        passenger: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    return ride;
  }

  /**
   * Get all rides for a specific passenger
   */
  async getPassengerRides(passengerId: string) {
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

    return rides;
  }

  /**
   * Get a ride by its ID with all related details
   */
  async getRideById(rideId: string) {
    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        passenger: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
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
    });

    if (!ride) {
      throw new AppError('Ride not found', 404);
    }

    return ride;
  }
}

export const rideService = new RideService();
