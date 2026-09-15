import { RideStatus, VehicleType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import {
  calculateDistance,
  estimateTravelTimeMinutes,
  CoordinatesInput,
  normalizeCoordinates,
  isValidCoordinate,
} from '../utils/location';
import { MatchingOptions } from '../validators/matching.validator';

export interface CandidateDriver {
  driverId: string;
  userId: string;
  name: string;
  phone: string | null;
  licenseNumber: string;
  vehicleType: VehicleType;
  vehicleModel: string;
  vehiclePlate: string;
  vehicleColor: string | null;
  rating: number;
  currentLat: number;
  currentLng: number;
  distanceKm: number;
  estimatedArrivalMin: number;
}

export interface MatchResult {
  ride: any;
  matchedDriver: CandidateDriver;
}

export class MatchingService {
  /**
   * Find all currently available drivers within a radius of the pickup location,
   * calculating their distance and estimated arrival time, sorted closest first.
   */
  async findAvailableDrivers(
    pickupLocation: CoordinatesInput,
    options: Partial<MatchingOptions> = {}
  ): Promise<CandidateDriver[]> {
    const pickupCoords = normalizeCoordinates(pickupLocation, 'Pickup');
    const maxRadiusKm = options.maxRadiusKm ?? 10.0;
    const limit = options.limit ?? 10;

    const whereClause: any = {
      isAvailable: true,
      currentLat: { not: null },
      currentLng: { not: null },
    };

    if (options.vehicleType) {
      whereClause.vehicleType = options.vehicleType;
    }

    const availableDrivers = await prisma.driver.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    const candidates: CandidateDriver[] = [];

    for (const driver of availableDrivers) {
      if (
        driver.currentLat === null ||
        driver.currentLng === null ||
        !isValidCoordinate({ lat: driver.currentLat, lng: driver.currentLng })
      ) {
        continue;
      }

      const driverCoords = { lat: driver.currentLat, lng: driver.currentLng };
      const distanceKm = calculateDistance(pickupCoords, driverCoords, {
        unit: 'km',
        decimals: 2,
      });

      if (distanceKm <= maxRadiusKm) {
        const estimatedArrivalMin = estimateTravelTimeMinutes(distanceKm, 30, 1);
        candidates.push({
          driverId: driver.id,
          userId: driver.userId,
          name: driver.user?.name || 'Driver',
          phone: driver.user?.phone || null,
          licenseNumber: driver.licenseNumber,
          vehicleType: driver.vehicleType,
          vehicleModel: driver.vehicleModel,
          vehiclePlate: driver.vehiclePlate,
          vehicleColor: driver.vehicleColor,
          rating: driver.rating,
          currentLat: driver.currentLat,
          currentLng: driver.currentLng,
          distanceKm,
          estimatedArrivalMin,
        });
      }
    }

    // Sort ascending by distance, breaking ties with higher rating
    candidates.sort((a, b) => {
      if (a.distanceKm !== b.distanceKm) {
        return a.distanceKm - b.distanceKm;
      }
      return b.rating - a.rating;
    });

    return candidates.slice(0, limit);
  }

  /**
   * Select the single nearest available and suitable driver to the pickup location.
   * Returns null if no suitable driver is available within maxRadiusKm.
   */
  async findNearestDriver(
    pickupLocation: CoordinatesInput,
    options: Partial<MatchingOptions> = {}
  ): Promise<CandidateDriver | null> {
    const candidates = await this.findAvailableDrivers(pickupLocation, {
      ...options,
      limit: 1,
    });

    if (candidates.length === 0) {
      return null;
    }

    return candidates[0];
  }

  /**
   * Validate driver availability and eligibility for assignment.
   */
  async validateDriverAvailability(driverId: string): Promise<{
    isEligible: boolean;
    reason?: string;
    driver?: any;
  }> {
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        user: {
          select: {
            name: true,
            phone: true,
          },
        },
      },
    });

    if (!driver) {
      return { isEligible: false, reason: 'Driver profile not found' };
    }

    if (!driver.isAvailable) {
      return { isEligible: false, reason: 'Driver is currently unavailable' };
    }

    if (
      driver.currentLat === null ||
      driver.currentLng === null ||
      !isValidCoordinate({ lat: driver.currentLat, lng: driver.currentLng })
    ) {
      return { isEligible: false, reason: 'Driver does not have a valid location recorded' };
    }

    return { isEligible: true, driver };
  }

  /**
   * Match and assign the nearest suitable available driver to a ride.
   * Prevents assignment if no driver is available or if driver is unavailable.
   */
  async matchDriverForRide(
    rideId: string,
    options: Partial<MatchingOptions> = {},
    authenticatedPassengerId?: string
  ): Promise<MatchResult> {
    if (!rideId) {
      throw new AppError('Ride ID is required', 400);
    }

    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
    });

    if (!ride) {
      throw new AppError('Ride not found', 404);
    }

    if (authenticatedPassengerId && ride.passengerId !== authenticatedPassengerId) {
      throw new AppError('Unauthorized: Ride belongs to a different passenger', 403);
    }

    if (ride.status !== RideStatus.REQUESTED) {
      throw new AppError(
        `Ride cannot be matched because its current status is '${ride.status}'`,
        400
      );
    }

    const pickupCoords = { lat: ride.pickupLat, lng: ride.pickupLng };
    const nearestDriver = await this.findNearestDriver(pickupCoords, options);

    if (!nearestDriver) {
      throw new AppError(
        'No available drivers found within the search radius. Please try again shortly.',
        404
      );
    }

    // Transaction execution: update driver availability to false and ride status to MATCHED
    const executeTx = async (tx: any) => {
      // Re-check driver availability inside transaction to prevent double assignment
      const driver = await tx.driver.findUnique({
        where: { id: nearestDriver.driverId },
      });

      if (!driver || !driver.isAvailable) {
        throw new AppError('Driver is no longer available for assignment', 409);
      }

      // Mark driver unavailable
      await tx.driver.update({
        where: { id: driver.id },
        data: { isAvailable: false },
      });

      // Update ride with matched driver and MATCHED status
      const updatedRide = await tx.ride.update({
        where: { id: ride.id },
        data: {
          driverId: driver.id,
          status: RideStatus.MATCHED,
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
          driver: {
            select: {
              id: true,
              vehicleType: true,
              vehicleModel: true,
              vehiclePlate: true,
              vehicleColor: true,
              rating: true,
              currentLat: true,
              currentLng: true,
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

      return {
        ride: updatedRide,
        matchedDriver: nearestDriver,
      };
    };

    if (typeof prisma.$transaction === 'function') {
      try {
        return await prisma.$transaction(executeTx);
      } catch (err: any) {
        if (err?.name === 'PrismaClientInitializationError') {
          return await executeTx(prisma);
        }
        throw err;
      }
    }
    return await executeTx(prisma);
  }

  /**
   * Assign a specific driver to a ride with strict validation preventing assignment
   * to unavailable or offline drivers.
   */
  async assignDriverToRide(
    rideId: string,
    driverId: string,
    authenticatedPassengerId?: string
  ): Promise<MatchResult> {
    if (!rideId) {
      throw new AppError('Ride ID is required', 400);
    }
    if (!driverId) {
      throw new AppError('Driver ID is required', 400);
    }

    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
    });

    if (!ride) {
      throw new AppError('Ride not found', 404);
    }

    if (authenticatedPassengerId && ride.passengerId !== authenticatedPassengerId) {
      throw new AppError('Unauthorized: Ride belongs to a different passenger', 403);
    }

    if (ride.status !== RideStatus.REQUESTED) {
      throw new AppError(
        `Ride cannot be assigned because its current status is '${ride.status}'`,
        400
      );
    }

    // STRICT CHECK: Driver must exist, be available, and have valid location coordinates
    const eligibility = await this.validateDriverAvailability(driverId);
    if (!eligibility.isEligible || !eligibility.driver) {
      throw new AppError(
        eligibility.reason || 'Driver is not available for assignment',
        400
      );
    }

    const driver = eligibility.driver;
    const pickupCoords = { lat: ride.pickupLat, lng: ride.pickupLng };
    const driverCoords = { lat: driver.currentLat!, lng: driver.currentLng! };

    const distanceKm = calculateDistance(pickupCoords, driverCoords, {
      unit: 'km',
      decimals: 2,
    });
    const estimatedArrivalMin = estimateTravelTimeMinutes(distanceKm, 30, 1);

    const candidateInfo: CandidateDriver = {
      driverId: driver.id,
      userId: driver.userId,
      name: driver.user?.name || 'Driver',
      phone: driver.user?.phone || null,
      licenseNumber: driver.licenseNumber,
      vehicleType: driver.vehicleType,
      vehicleModel: driver.vehicleModel,
      vehiclePlate: driver.vehiclePlate,
      vehicleColor: driver.vehicleColor,
      rating: driver.rating,
      currentLat: driver.currentLat!,
      currentLng: driver.currentLng!,
      distanceKm,
      estimatedArrivalMin,
    };

    const executeTx = async (tx: any) => {
      // Mark driver unavailable
      await tx.driver.update({
        where: { id: driver.id },
        data: { isAvailable: false },
      });

      // Update ride
      const updatedRide = await tx.ride.update({
        where: { id: ride.id },
        data: {
          driverId: driver.id,
          status: RideStatus.MATCHED,
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
          driver: {
            select: {
              id: true,
              vehicleType: true,
              vehicleModel: true,
              vehiclePlate: true,
              vehicleColor: true,
              rating: true,
              currentLat: true,
              currentLng: true,
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

      return {
        ride: updatedRide,
        matchedDriver: candidateInfo,
      };
    };

    if (typeof prisma.$transaction === 'function') {
      try {
        return await prisma.$transaction(executeTx);
      } catch (err: any) {
        if (err?.name === 'PrismaClientInitializationError') {
          return await executeTx(prisma);
        }
        throw err;
      }
    }
    return await executeTx(prisma);
  }
}

export const matchingService = new MatchingService();
