import { PaymentStatus, RideStatus, VehicleType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { calculateRideDistance } from '../utils/location';

// ─── Fare Rules ───────────────────────────────────────────────────────────────

/**
 * Predefined fare rules per vehicle type.
 * Formula: totalFare = baseFare + (distanceKm × ratePerKm)
 * timeFare and surgeMultiplier are reserved for future use and default to 0 / 1.0.
 */
export const FARE_RULES: Record<
  VehicleType,
  { baseFare: number; ratePerKm: number }
> = {
  [VehicleType.STANDARD]: { baseFare: 30, ratePerKm: 12 },
  [VehicleType.PREMIUM]:  { baseFare: 60, ratePerKm: 20 },
  [VehicleType.XL]:       { baseFare: 50, ratePerKm: 16 },
};

export interface FareBreakdown {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  surgeMultiplier: number;
  totalFare: number;
  distanceKm: number;
  currency: string;
  vehicleType: VehicleType;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class FareService {
  /**
   * Calculate fare breakdown from a distance and vehicle type using the
   * predefined fare rules: totalFare = baseFare + (distanceKm × ratePerKm).
   */
  calculateFareBreakdown(
    distanceKm: number,
    vehicleType: VehicleType = VehicleType.STANDARD
  ): FareBreakdown {
    if (distanceKm < 0) {
      throw new AppError('Distance must be non-negative', 400);
    }

    const rules = FARE_RULES[vehicleType] ?? FARE_RULES[VehicleType.STANDARD];
    const baseFare = rules.baseFare;
    const distanceFare = parseFloat((distanceKm * rules.ratePerKm).toFixed(2));
    const timeFare = 0;
    const surgeMultiplier = 1.0;
    const totalFare = parseFloat(
      ((baseFare + distanceFare + timeFare) * surgeMultiplier).toFixed(2)
    );

    return {
      baseFare,
      distanceFare,
      timeFare,
      surgeMultiplier,
      totalFare,
      distanceKm: parseFloat(distanceKm.toFixed(2)),
      currency: 'INR',
      vehicleType,
    };
  }

  /**
   * Estimate fare directly from pickup and dropoff coordinates and vehicle type (task #17).
   */
  estimateFareFromLocations(
    pickup: { lat: number; lng: number },
    dropoff: { lat: number; lng: number },
    vehicleType: VehicleType = VehicleType.STANDARD
  ): FareBreakdown & { pickup: { lat: number; lng: number }; dropoff: { lat: number; lng: number } } {
    const distanceKm = calculateRideDistance(pickup, dropoff, 2);
    const breakdown = this.calculateFareBreakdown(distanceKm, vehicleType);
    return {
      pickup,
      dropoff,
      ...breakdown,
    };
  }

  /**
   * Estimate the fare for a ride from pickup/dropoff coordinates (task #17).
   * Computes the straight-line distance via Haversine and applies fare rules.
   */
  async estimateFareForRide(
    rideId: string
  ): Promise<FareBreakdown & { rideId: string }> {
    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        driver: { select: { vehicleType: true } },
      },
    });

    if (!ride) {
      throw new AppError('Ride not found', 404);
    }

    // Use recorded distanceKm if available; otherwise compute from coordinates.
    let distanceKm = ride.distanceKm ?? null;
    if (distanceKm === null || distanceKm <= 0) {
      distanceKm = calculateRideDistance(
        { lat: ride.pickupLat, lng: ride.pickupLng },
        { lat: ride.dropoffLat, lng: ride.dropoffLng },
        2
      );
    }

    const vehicleType = ride.driver?.vehicleType ?? VehicleType.STANDARD;
    const breakdown = this.calculateFareBreakdown(distanceKm, vehicleType);

    return { rideId, ...breakdown };
  }

  /**
   * Calculate and persist the final fare when a driver completes a ride (task #18).
   * Uses the same predefined fare rules and the ride's recorded distance.
   * Creates the Fare record and updates ride status to COMPLETED atomically.
   */
  async completeFare(
    rideId: string,
    driverUserId: string,
    recordedDistanceKm?: number
  ): Promise<{
    ride: any;
    fare: any;
  }> {
    if (recordedDistanceKm !== undefined && recordedDistanceKm !== null) {
      if (
        typeof recordedDistanceKm !== 'number' ||
        Number.isNaN(recordedDistanceKm) ||
        recordedDistanceKm < 0
      ) {
        throw new AppError('Recorded distance must be a non-negative number', 400);
      }
    }

    // Load ride with driver profile
    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        driver: {
          include: {
            user: { select: { id: true } },
          },
        },
      },
    });

    if (!ride) {
      throw new AppError('Ride not found', 404);
    }

    // Verify the driver performing completion is the one assigned to this ride
    if (!ride.driver) {
      throw new AppError('No driver assigned to this ride', 400);
    }

    if (ride.driver.user.id !== driverUserId) {
      throw new AppError('Unauthorized: You are not the driver for this ride', 403);
    }

    // Only rides that are IN_PROGRESS can be completed
    if (ride.status !== RideStatus.IN_PROGRESS && ride.status !== RideStatus.ACCEPTED) {
      throw new AppError(
        `Ride cannot be completed because its current status is '${ride.status}'`,
        400
      );
    }

    // Prevent duplicate fare creation
    const existingFare = await prisma.fare.findUnique({ where: { rideId } });
    if (existingFare) {
      throw new AppError('Fare has already been recorded for this ride', 409);
    }

    // Calculate distance (use passed-in recorded distance > stored value > coordinate calculation)
    let distanceKm: number;
    if (typeof recordedDistanceKm === 'number' && recordedDistanceKm >= 0) {
      distanceKm = recordedDistanceKm;
    } else if (ride.distanceKm !== null && ride.distanceKm !== undefined && ride.distanceKm > 0) {
      distanceKm = ride.distanceKm;
    } else {
      distanceKm = calculateRideDistance(
        { lat: ride.pickupLat, lng: ride.pickupLng },
        { lat: ride.dropoffLat, lng: ride.dropoffLng },
        2
      );
    }

    const vehicleType = ride.driver.vehicleType;
    const breakdown = this.calculateFareBreakdown(distanceKm, vehicleType);

    // Atomically: create Fare + set ride COMPLETED + persist final distanceKm
    const executeTx = async (tx: any) => {
      const fare = await tx.fare.create({
        data: {
          rideId: ride.id,
          baseFare: breakdown.baseFare,
          distanceFare: breakdown.distanceFare,
          timeFare: breakdown.timeFare,
          surgeMultiplier: breakdown.surgeMultiplier,
          totalFare: breakdown.totalFare,
          currency: breakdown.currency,
          paymentStatus: PaymentStatus.PENDING,
        },
      });

      const completedRide = await tx.ride.update({
        where: { id: ride.id },
        data: {
          status: RideStatus.COMPLETED,
          distanceKm: breakdown.distanceKm,
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
              rating: true,
            },
          },
          fare: true,
        },
      });

      return { ride: completedRide, fare };
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

export const fareService = new FareService();
