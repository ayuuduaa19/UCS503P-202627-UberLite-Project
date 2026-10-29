import { RideStatus, VehicleType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import {
  calculateDistance,
  estimateTravelTimeMinutes,
  CoordinatesInput,
  normalizeCoordinates,
  isValidCoordinate,
  calculateBoundingBox,
  isWithinBoundingBox,
} from '../utils/location';
import { concurrencyCoordinator } from '../utils/concurrency';
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
   *
   * Task 39: Location-based search optimization using geographic bounding box
   * and composite index filtering at the database layer.
   */
  async findAvailableDrivers(
    pickupLocation: CoordinatesInput,
    options: Partial<MatchingOptions> = {}
  ): Promise<CandidateDriver[]> {
    const pickupCoords = normalizeCoordinates(pickupLocation, 'Pickup');
    const maxRadiusKm = options.maxRadiusKm ?? 10.0;
    const limit = options.limit ?? 10;

    // Task 39: Calculate geographic bounding box to filter at the database level
    const bbox = calculateBoundingBox(pickupCoords, maxRadiusKm);

    const whereClause: any = {
      isAvailable: true,
      currentLat: {
        gte: bbox.minLat,
        lte: bbox.maxLat,
      },
      currentLng: {
        gte: bbox.minLng,
        lte: bbox.maxLng,
      },
    };

    if (options.vehicleType) {
      whereClause.vehicleType = options.vehicleType;
    }

    let availableDrivers: any[] = [];
    try {
      availableDrivers = await prisma.driver.findMany({
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
    } catch (err: any) {
      if (err?.name === 'PrismaClientInitializationError') {
        return [];
      }
      throw err;
    }

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
   * Internal helper to execute transactional driver assignment with atomic concurrency guards
   */
  private async executeDriverAssignmentTx(
    rideId: string,
    candidate: CandidateDriver,
    authenticatedPassengerId?: string
  ): Promise<MatchResult> {
    return concurrencyCoordinator.withLock(`driver:${candidate.driverId}`, async () => {
      const executeTx = async (tx: any) => {
        // Re-check ride status inside transaction to prevent concurrent double-assignment
        const freshRide = await tx.ride.findUnique({
          where: { id: rideId },
          select: { status: true, driverId: true, passengerId: true },
        });

        if (!freshRide || freshRide.status !== RideStatus.REQUESTED) {
          throw new AppError(
            'Ride has already been matched by a concurrent request',
            409
          );
        }

        if (authenticatedPassengerId && freshRide.passengerId !== authenticatedPassengerId) {
          throw new AppError('Unauthorized: Ride belongs to a different passenger', 403);
        }

        // Re-check driver availability inside transaction to prevent double assignment
        const driver = await tx.driver.findUnique({
          where: { id: candidate.driverId },
        });

        if (!driver || !driver.isAvailable) {
          throw new AppError('Driver is no longer available for assignment', 409);
        }

        // Atomically mark driver unavailable inside transaction to prevent concurrent double-booking
        try {
          if (typeof tx.driver.updateMany === 'function') {
            const updateResult = await tx.driver.updateMany({
              where: { id: driver.id, isAvailable: true },
              data: { isAvailable: false },
            });
            if (updateResult && updateResult.count === 0) {
              throw new AppError('Driver is no longer available for assignment', 409);
            }
          } else {
            await tx.driver.update({
              where: { id: driver.id },
              data: { isAvailable: false },
            });
          }
        } catch (err: any) {
          if (err instanceof AppError) {
            throw err;
          }
          if (err?.name === 'PrismaClientInitializationError') {
            await tx.driver.update({
              where: { id: driver.id },
              data: { isAvailable: false },
            });
          } else {
            throw err;
          }
        }

        // Update ride with matched driver and MATCHED status
        const updatedRide = await tx.ride.update({
          where: { id: rideId },
          data: {
            driverId: driver.id,
            status: RideStatus.MATCHED,
            matchedAt: new Date(),
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
          matchedDriver: candidate,
        };
      };

      if (typeof prisma.$transaction === 'function') {
        try {
          return await prisma.$transaction(executeTx, { maxWait: 10000, timeout: 20000 });
        } catch (err: any) {
          if (err?.name === 'PrismaClientInitializationError') {
            return await executeTx(prisma);
          }
          throw err;
        }
      }
      return await executeTx(prisma);
    });
  }

  /**
   * Match and assign the nearest suitable available driver to a ride.
   * Prevents assignment if no driver is available or if driver is unavailable.
   *
   * Task 40: Enhanced concurrent ride handling. If the nearest candidate driver
   * was claimed by a concurrent transaction, falls back to the next closest candidate.
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
    const candidates = await this.findAvailableDrivers(pickupCoords, {
      ...options,
      limit: Math.max(options.limit ?? 10, 10),
    });

    if (candidates.length === 0) {
      throw new AppError(
        'No available drivers found within the search radius. Please try again shortly.',
        404
      );
    }

    let lastError: any = null;
    for (const candidate of candidates) {
      try {
        return await this.executeDriverAssignmentTx(ride.id, candidate, authenticatedPassengerId);
      } catch (err: any) {
        if (
          err instanceof AppError &&
          err.statusCode === 409 &&
          err.message.includes('Driver is no longer available')
        ) {
          lastError = err;
          // Concurrent race condition: candidate was claimed just now. Try next nearest candidate!
          continue;
        }
        // Ride already matched concurrently or unauthorized - throw immediately
        throw err;
      }
    }

    throw (
      lastError ||
      new AppError(
        'No available drivers found within the search radius. Please try again shortly.',
        404
      )
    );
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

    return await this.executeDriverAssignmentTx(ride.id, candidateInfo, authenticatedPassengerId);
  }
}

export const matchingService = new MatchingService();

