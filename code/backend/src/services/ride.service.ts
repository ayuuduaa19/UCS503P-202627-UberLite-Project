import { RideStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { calculateDistance, estimateTravelTimeMinutes } from '../utils/location';
import { concurrencyCoordinator } from '../utils/concurrency';
import { CreateRideInput } from '../validators/ride.validator';
import { RideHistoryFilterInput } from '../validators/feedback.validator';
import { realtimeService } from './realtime.service';

export class RideService {
  /**
   * Active statuses representing an unfinalized ride in progress
   */
  public static readonly ACTIVE_STATUSES: RideStatus[] = [
    RideStatus.REQUESTED,
    RideStatus.MATCHED,
    RideStatus.ACCEPTED,
    RideStatus.IN_PROGRESS,
  ];

  /**
   * Retrieve the current active ride for an authenticated passenger (if any)
   */
  async getActiveRideForPassenger(passengerId: string) {
    if (!passengerId) return null;
    try {
      if (typeof prisma.ride.findMany === 'function') {
        const rides = await prisma.ride.findMany({
          where: { passengerId },
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
                    id: true,
                    name: true,
                    phone: true,
                    email: true,
                  },
                },
              },
            },
            fare: true,
            feedbacks: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (Array.isArray(rides)) {
          return (
            rides.find(
              (r) =>
                r.passengerId === passengerId &&
                RideService.ACTIVE_STATUSES.includes(r.status)
            ) || null
          );
        }
      }
    } catch (err: any) {
      if (err?.name === 'PrismaClientInitializationError') {
        return null;
      }
      throw err;
    }
    return null;
  }

  /**
   * Retrieve the current active ride for an authenticated driver (if any)
   */
  async getActiveRideForDriver(driverUserId: string) {
    if (!driverUserId) return null;
    const driver = await prisma.driver.findUnique({
      where: { userId: driverUserId },
    });
    if (!driver) return null;

    try {
      if (typeof prisma.ride.findMany === 'function') {
        const rides = await prisma.ride.findMany({
          where: { driverId: driver.id },
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
              },
            },
            fare: true,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (Array.isArray(rides)) {
          const activeStatuses: RideStatus[] = [
            RideStatus.MATCHED,
            RideStatus.ACCEPTED,
            RideStatus.IN_PROGRESS,
          ];
          return rides.find((r) => activeStatuses.includes(r.status)) || null;
        }
      }
    } catch (err: any) {
      if (err?.name === 'PrismaClientInitializationError') {
        return null;
      }
      throw err;
    }
    return null;
  }

  /**
   * Create a new ride request for an authenticated passenger.
   *
   * Task 40: Enforces active-ride coordination and request concurrency locking.
   * A passenger cannot create a new ride request if they already have an active ride
   * in progress (REQUESTED, MATCHED, ACCEPTED, or IN_PROGRESS).
   */
  async createRide(
    passengerId: string,
    input: CreateRideInput,
    options?: { allowConcurrent?: boolean }
  ) {
    if (!passengerId) {
      throw new AppError('Passenger ID is required', 400);
    }

    return concurrencyCoordinator.withLock(`passenger:${passengerId}`, async () => {
      // Coordinate active rides: verify passenger does not already have an active ride
      if (!options?.allowConcurrent) {
        const activeRide = await this.getActiveRideForPassenger(passengerId).catch(() => null);
        if (activeRide) {
          throw new AppError('Passenger already has an active ride in progress', 409);
        }
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

      realtimeService.emitRideUpdate(ride, ride.status);

      return ride;
    });
  }

  /**
   * Get all rides for a specific passenger (supports optional status filtering)
   */
  async getPassengerRides(passengerId: string, status?: RideStatus) {
    const where: any = { passengerId };
    if (status) {
      where.status = status;
    }

    const rides = await prisma.ride.findMany({
      where,
      include: {
        driver: {
          select: {
            id: true,
            vehicleType: true,
            vehicleModel: true,
            vehiclePlate: true,
            vehicleColor: true,
            currentLat: true,
            currentLng: true,
            rating: true,
            updatedAt: true,
            user: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
              },
            },
          },
        },
        fare: true,
        feedbacks: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return rides;
  }

  /**
   * Get completed ride history for a specific passenger with search and filtering support (Task 41)
   */
  async getPassengerRideHistory(
    passengerId: string,
    filterOrStatus?: RideStatus | RideHistoryFilterInput
  ) {
    const filter: RideHistoryFilterInput =
      typeof filterOrStatus === 'string'
        ? { status: filterOrStatus as RideStatus }
        : filterOrStatus || {};

    const where: any = { passengerId };

    const status = filter.status ?? RideStatus.COMPLETED;
    if (status) {
      where.status = status;
    }

    // Date range filtering
    const fromDate = filter.startDate || filter.from;
    const toDate = filter.endDate || filter.to;
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = new Date(fromDate);
      }
      if (toDate) {
        const end = new Date(toDate);
        if (toDate.length <= 10) {
          end.setUTCHours(23, 59, 59, 999);
        }
        where.createdAt.lte = end;
      }
    }

    // Fare range filtering
    if (filter.minFare !== undefined || filter.maxFare !== undefined) {
      where.fare = where.fare || {};
      where.fare.totalFare = {};
      if (filter.minFare !== undefined && !isNaN(filter.minFare)) {
        where.fare.totalFare.gte = filter.minFare;
      }
      if (filter.maxFare !== undefined && !isNaN(filter.maxFare)) {
        where.fare.totalFare.lte = filter.maxFare;
      }
    }

    // Vehicle type filtering
    if (filter.vehicleType) {
      where.driver = where.driver || {};
      where.driver.vehicleType = filter.vehicleType;
    }

    // Rating filtering
    if (filter.rating !== undefined && !isNaN(filter.rating)) {
      where.feedbacks = {
        some: {
          rating: { gte: filter.rating },
        },
      };
    }

    // Search query across addresses and driver info
    if (filter.search && filter.search.trim() !== '') {
      const q = filter.search.trim();
      where.OR = [
        { pickupAddress: { contains: q, mode: 'insensitive' } },
        { dropoffAddress: { contains: q, mode: 'insensitive' } },
        {
          driver: {
            user: {
              name: { contains: q, mode: 'insensitive' },
            },
          },
        },
        {
          driver: {
            vehiclePlate: { contains: q, mode: 'insensitive' },
          },
        },
        {
          driver: {
            vehicleModel: { contains: q, mode: 'insensitive' },
          },
        },
      ];
    }

    let orderBy: any = { createdAt: 'desc' };
    const sortOrder = filter.sortOrder || 'desc';
    if (filter.sortBy === 'fare' || filter.sortBy === 'totalFare') {
      orderBy = { fare: { totalFare: sortOrder } };
    } else if (filter.sortBy === 'distance' || filter.sortBy === 'distanceKm') {
      orderBy = { distanceKm: sortOrder };
    } else if (filter.sortBy === 'createdAt' || filter.sortBy === 'date') {
      orderBy = { createdAt: sortOrder };
    }

    const queryOptions: any = {
      where,
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
                id: true,
                name: true,
                phone: true,
                email: true,
              },
            },
          },
        },
        fare: true,
        feedbacks: true,
      },
      orderBy,
    };

    if (filter.limit !== undefined && !isNaN(filter.limit)) {
      queryOptions.take = filter.limit;
    }
    if (filter.offset !== undefined && !isNaN(filter.offset)) {
      queryOptions.skip = filter.offset;
    }

    return prisma.ride.findMany(queryOptions);
  }

  /**
   * Get completed ride history for a specific driver with search and filtering support (Task 41)
   */
  async getDriverRideHistory(
    driverUserId: string,
    filterOrStatus?: RideStatus | RideHistoryFilterInput
  ) {
    const filter: RideHistoryFilterInput =
      typeof filterOrStatus === 'string'
        ? { status: filterOrStatus as RideStatus }
        : filterOrStatus || {};

    const driver = await prisma.driver.findUnique({
      where: { userId: driverUserId },
    });

    if (!driver) {
      throw new AppError('Driver profile not found', 404);
    }

    const where: any = { driverId: driver.id };
    const status = filter.status ?? RideStatus.COMPLETED;
    if (status) {
      where.status = status;
    }

    // Date range filtering
    const fromDate = filter.startDate || filter.from;
    const toDate = filter.endDate || filter.to;
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = new Date(fromDate);
      }
      if (toDate) {
        const end = new Date(toDate);
        if (toDate.length <= 10) {
          end.setUTCHours(23, 59, 59, 999);
        }
        where.createdAt.lte = end;
      }
    }

    // Fare range filtering
    if (filter.minFare !== undefined || filter.maxFare !== undefined) {
      where.fare = where.fare || {};
      where.fare.totalFare = {};
      if (filter.minFare !== undefined && !isNaN(filter.minFare)) {
        where.fare.totalFare.gte = filter.minFare;
      }
      if (filter.maxFare !== undefined && !isNaN(filter.maxFare)) {
        where.fare.totalFare.lte = filter.maxFare;
      }
    }

    // Rating filtering
    if (filter.rating !== undefined && !isNaN(filter.rating)) {
      where.feedbacks = {
        some: {
          rating: { gte: filter.rating },
        },
      };
    }

    // Search query across addresses and passenger info
    if (filter.search && filter.search.trim() !== '') {
      const q = filter.search.trim();
      where.OR = [
        { pickupAddress: { contains: q, mode: 'insensitive' } },
        { dropoffAddress: { contains: q, mode: 'insensitive' } },
        {
          passenger: {
            name: { contains: q, mode: 'insensitive' },
          },
        },
        {
          passenger: {
            phone: { contains: q, mode: 'insensitive' },
          },
        },
        {
          passenger: {
            email: { contains: q, mode: 'insensitive' },
          },
        },
      ];
    }

    let orderBy: any = { createdAt: 'desc' };
    const sortOrder = filter.sortOrder || 'desc';
    if (filter.sortBy === 'fare' || filter.sortBy === 'totalFare') {
      orderBy = { fare: { totalFare: sortOrder } };
    } else if (filter.sortBy === 'distance' || filter.sortBy === 'distanceKm') {
      orderBy = { distanceKm: sortOrder };
    } else if (filter.sortBy === 'createdAt' || filter.sortBy === 'date') {
      orderBy = { createdAt: sortOrder };
    }

    const queryOptions: any = {
      where,
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
          },
        },
        fare: true,
        feedbacks: true,
      },
      orderBy,
    };

    if (filter.limit !== undefined && !isNaN(filter.limit)) {
      queryOptions.take = filter.limit;
    }
    if (filter.offset !== undefined && !isNaN(filter.offset)) {
      queryOptions.skip = filter.offset;
    }

    return prisma.ride.findMany(queryOptions);
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
            vehicleColor: true,
            currentLat: true,
            currentLng: true,
            rating: true,
            updatedAt: true,
            user: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
              },
            },
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
   * Task 43: Get real-time ride tracking telemetry using periodic driver location updates
   */
  async getRideTracking(rideId: string, requestingPassengerId?: string) {
    const ride = await this.getRideById(rideId);

    if (requestingPassengerId && ride.passengerId !== requestingPassengerId) {
      throw new AppError('Unauthorized: Ride belongs to a different passenger', 403);
    }

    let trackingData = null;
    const driverAny = ride.driver as any;
    if (driverAny && driverAny.currentLat != null && driverAny.currentLng != null) {
      const driverCoords = { lat: driverAny.currentLat, lng: driverAny.currentLng };

      // Determine current destination based on ride status:
      // MATCHED / ACCEPTED -> Driver heading to Pickup
      // IN_PROGRESS -> Driver heading to Dropoff
      const isHeadingToPickup = ride.status === RideStatus.MATCHED || ride.status === RideStatus.ACCEPTED;
      const targetCoords = isHeadingToPickup
        ? { lat: ride.pickupLat, lng: ride.pickupLng }
        : { lat: ride.dropoffLat, lng: ride.dropoffLng };
      const targetAddress = isHeadingToPickup ? ride.pickupAddress : ride.dropoffAddress;
      const targetType = isHeadingToPickup ? 'PICKUP' : 'DROPOFF';

      const distanceToTargetKm = calculateDistance(driverCoords, targetCoords, { unit: 'km', decimals: 2 });
      const estimatedArrivalMin = estimateTravelTimeMinutes(distanceToTargetKm, 30, 1);

      trackingData = {
        driverDistanceToTargetKm: distanceToTargetKm,
        estimatedArrivalMin,
        targetType,
        targetAddress,
        targetCoords,
        driverCurrentLocation: driverCoords,
        lastDriverLocationUpdate: driverAny.updatedAt || new Date(),
      };
    }

    return {
      ride,
      tracking: trackingData,
    };
  }

  /**
   * Accept a ride assigned to the authenticated driver.
   *
   * Rules enforced:
   *  - Ride must exist.
   *  - Ride status must be MATCHED (not already accepted/cancelled/etc.).
   *  - The requesting driver must be the one assigned to this ride.
   *  - Driver cannot have another active ride already in progress.
   *
   * On success: ride status → ACCEPTED. Driver isAvailable remains false.
   */
  async acceptRide(rideId: string, driverUserId: string) {
    return concurrencyCoordinator.withLock(`ride:${rideId}`, async () => {
      // Resolve driver profile from user id
      const driver = await prisma.driver.findUnique({
        where: { userId: driverUserId },
      });

      if (!driver) {
        throw new AppError('Driver profile not found', 404);
      }

      // Active-ride coordination: ensure driver doesn't have another ride in progress
      const currentActiveRide = await this.getActiveRideForDriver(driverUserId).catch(() => null);
      if (
        currentActiveRide &&
        currentActiveRide.id !== rideId &&
        (currentActiveRide.status === RideStatus.ACCEPTED ||
          currentActiveRide.status === RideStatus.IN_PROGRESS)
      ) {
        throw new AppError('Driver already has an active ride in progress', 409);
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
        data: {
          status: RideStatus.ACCEPTED,
          acceptedAt: new Date(),
        },
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

      realtimeService.emitRideUpdate(updatedRide, RideStatus.ACCEPTED);

      return updatedRide;
    });
  }

  /**
   * Start a ride that has been accepted by the authenticated driver.
   *
   * Rules enforced:
   *  - Ride must exist.
   *  - Ride status must be ACCEPTED.
   *  - The requesting driver must be the one assigned to this ride.
   *
   * On success:
   *  - Ride status → IN_PROGRESS.
   *  - Driver isAvailable → false (confirmed atomically so no concurrent
   *    matching can assign them a second ride between ACCEPTED and IN_PROGRESS).
   */
  async startRide(rideId: string, driverUserId: string) {
    return concurrencyCoordinator.withLock(`ride:${rideId}`, async () => {
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

      if (ride.status !== RideStatus.ACCEPTED) {
        throw new AppError(
          `Ride cannot be started because its current status is '${ride.status}'. Expected: ACCEPTED`,
          400
        );
      }

      if (ride.driverId !== driver.id) {
        throw new AppError(
          'Forbidden: you are not the driver assigned to this ride',
          403
        );
      }

      // Run both updates atomically: mark ride IN_PROGRESS and confirm driver
      // unavailable to prevent any conflicting ride assignment.
      const [updatedRide] = await prisma.$transaction([
        prisma.ride.update({
          where: { id: rideId },
          data: {
            status: RideStatus.IN_PROGRESS,
            startedAt: new Date(),
          },
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
        }),
        prisma.driver.update({
          where: { id: driver.id },
          data: { isAvailable: false },
        }),
      ]);

      realtimeService.emitRideUpdate(updatedRide, RideStatus.IN_PROGRESS);

      return updatedRide;
    });
  }

  /**
   * Complete a ride that is currently in progress for the authenticated driver.
   *
   * Rules enforced:
   *  - Ride must exist.
   *  - Ride status must be IN_PROGRESS.
   *  - The requesting driver must be the one assigned to this ride.
   *
   * On success:
   *  - Ride status → COMPLETED.
   *  - Driver isAvailable → true (they are free to take new rides).
   */
  async completeRide(rideId: string, driverUserId: string) {
    return concurrencyCoordinator.withLock(`ride:${rideId}`, async () => {
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

      if (ride.status !== RideStatus.IN_PROGRESS) {
        throw new AppError(
          `Ride cannot be completed because its current status is '${ride.status}'. Expected: IN_PROGRESS`,
          400
        );
      }

      if (ride.driverId !== driver.id) {
        throw new AppError(
          'Forbidden: you are not the driver assigned to this ride',
          403
        );
      }

      // Run both updates atomically: mark ride COMPLETED and free up the driver
      const [updatedRide] = await prisma.$transaction([
        prisma.ride.update({
          where: { id: rideId },
          data: {
            status: RideStatus.COMPLETED,
            completedAt: new Date(),
          },
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
        }),
        prisma.driver.update({
          where: { id: driver.id },
          data: { isAvailable: true },
        }),
      ]);

      realtimeService.emitRideUpdate(updatedRide, RideStatus.COMPLETED);

      return updatedRide;
    });
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
    return concurrencyCoordinator.withLock(`ride:${rideId}`, async () => {
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
            matchedAt: null,
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

      realtimeService.emitRideUpdate(updatedRide, 'REJECTED');

      return updatedRide;
    });
  }

  /**
   * Cancel a ride (can be requested by passenger or driver before completion).
   */
  async cancelRide(rideId: string, userId: string) {
    return concurrencyCoordinator.withLock(`ride:${rideId}`, async () => {
      const ride = await prisma.ride.findUnique({
        where: { id: rideId },
        include: { driver: true },
      });

      if (!ride) {
        throw new AppError('Ride not found', 404);
      }

      if (ride.status === RideStatus.COMPLETED) {
        throw new AppError('Completed rides cannot be cancelled', 400);
      }

      if (ride.status === RideStatus.CANCELLED) {
        throw new AppError('Ride is already cancelled', 400);
      }

      const isPassenger = ride.passengerId === userId;
      const isAssignedDriver = ride.driver?.userId === userId;

      if (!isPassenger && !isAssignedDriver) {
        throw new AppError('Forbidden: You are not authorized to cancel this ride', 403);
      }

      const updates: any[] = [
        prisma.ride.update({
          where: { id: rideId },
          data: {
            status: RideStatus.CANCELLED,
            cancelledAt: new Date(),
          },
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
              },
            },
          },
        }),
      ];

      if (ride.driverId) {
        updates.push(
          prisma.driver.update({
            where: { id: ride.driverId },
            data: { isAvailable: true },
          })
        );
      }

      const [cancelledRide] = await prisma.$transaction(updates);
      realtimeService.emitRideUpdate(cancelledRide, RideStatus.CANCELLED);
      return cancelledRide;
    });
  }
}

export const rideService = new RideService();

