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

  /**
   * Accept a ride assigned to the authenticated driver.
   *
   * Rules enforced:
   *  - Ride must exist.
   *  - Ride status must be MATCHED (not already accepted/cancelled/etc.).
   *  - The requesting driver must be the one assigned to this ride.
   *
   * On success: ride status → ACCEPTED. Driver remains unavailable (they are
   * now committed to this ride).
   */
  async acceptRide(rideId: string, driverUserId: string) {
    // Resolve driver profile from user id
    const driver = await prisma.driver.findUnique({
      where: { userId: driverUserId },
    });

    if (!driver) {
      throw new AppError('Driver profile not found', 404);
    }

    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        passenger: {
          select: { id: true, name: true, phone: true, email: true },
        },
        driver: {
          select: {
            id: true,
            vehicleType: true,
            vehicleModel: true,
            vehiclePlate: true,
            vehicleColor: true,
            rating: true,
            user: { select: { name: true, phone: true } },
          },
        },
      },
    });

    if (!ride) {
      throw new AppError('Ride not found', 404);
    }

    if (ride.status !== RideStatus.MATCHED) {
      throw new AppError(
        `Ride cannot be accepted because its current status is '${ride.status}'`,
        400
      );
    }

    if (ride.driverId !== driver.id) {
      throw new AppError(
        'Forbidden: you are not the driver assigned to this ride',
        403
      );
    }

    const updatedRide = await prisma.ride.update({
      where: { id: rideId },
      data: { status: RideStatus.ACCEPTED },
      include: {
        passenger: {
          select: { id: true, name: true, phone: true, email: true },
        },
        driver: {
          select: {
            id: true,
            vehicleType: true,
            vehicleModel: true,
            vehiclePlate: true,
            vehicleColor: true,
            rating: true,
            user: { select: { name: true, phone: true } },
          },
        },
      },
    });

    return updatedRide;
  }

  /**
   * Reject a ride assigned to the authenticated driver.
   *
   * Rules enforced:
   *  - Ride must exist.
   *  - Ride status must be MATCHED.
   *  - The requesting driver must be the one assigned to this ride.
   *
   * On success:
   *  - Ride status → REQUESTED, driverId cleared (ride is available for
   *    re-matching to another driver).
   *  - Driver isAvailable → true (they are free to be matched again).
   */
  async rejectRide(rideId: string, driverUserId: string) {
    // Resolve driver profile from user id
    const driver = await prisma.driver.findUnique({
      where: { userId: driverUserId },
    });

    if (!driver) {
      throw new AppError('Driver profile not found', 404);
    }

    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
    });

    if (!ride) {
      throw new AppError('Ride not found', 404);
    }

    if (ride.status !== RideStatus.MATCHED) {
      throw new AppError(
        `Ride cannot be rejected because its current status is '${ride.status}'`,
        400
      );
    }

    if (ride.driverId !== driver.id) {
      throw new AppError(
        'Forbidden: you are not the driver assigned to this ride',
        403
      );
    }

    // Run both updates atomically so the ride and driver are always consistent
    const [updatedRide] = await prisma.$transaction([
      prisma.ride.update({
        where: { id: rideId },
        data: {
          status: RideStatus.REQUESTED,
          driverId: null,
        },
        include: {
          passenger: {
            select: { id: true, name: true, phone: true, email: true },
          },
        },
      }),
      prisma.driver.update({
        where: { id: driver.id },
        data: { isAvailable: true },
      }),
    ]);

    return updatedRide;
  }
}

export const rideService = new RideService();
