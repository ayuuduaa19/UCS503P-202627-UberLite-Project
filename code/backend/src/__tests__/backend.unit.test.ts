import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RideStatus, VehicleType } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import {
  calculateDistance,
  calculateRideDistance,
  estimateTravelTimeMinutes,
  calculateDistanceAndDuration,
  isWithinRadius,
  sortByDistance,
  filterByRadius,
  findNearest,
  normalizeCoordinates,
  isValidCoordinate,
} from '../utils/location';
import {
  fareService,
  FARE_RULES,
  FareBreakdown,
} from '../services/fare.service';
import { matchingService } from '../services/matching.service';
import { rideService } from '../services/ride.service';
import { prisma } from '../lib/prisma';
import {
  registerSchema,
  loginSchema,
  createRideSchema,
  updateAvailabilitySchema,
  updateLocationSchema,
  estimateFareFromLocationsSchema,
  createFeedbackSchema,
  idParamSchema,
} from '../validators';

describe('Task 22: Backend Unit Tests (Distance, Fare, Matching, Transitions, Validation)', () => {

  // ═════════════════════════════════════════════════════════════════════════
  // 1. Distance Calculation Unit Tests
  // ═════════════════════════════════════════════════════════════════════════
  describe('1. Distance Calculation Unit Tests', () => {
    const delhi = { lat: 28.6139, lng: 77.209 };
    const noida = { lat: 28.5355, lng: 77.391 };
    const bangalore = { lat: 12.9716, lng: 77.5946 };

    it('should return 0 km when origin and destination are identical', () => {
      const distance = calculateDistance(delhi, delhi);
      assert.equal(distance, 0);
    });

    it('should accurately calculate short-haul distance between Delhi and Noida (~20 km)', () => {
      const distance = calculateDistance(delhi, noida, { unit: 'km', decimals: 2 });
      assert.ok(distance > 18 && distance < 22, `Expected ~19-20 km, got ${distance}`);
    });

    it('should accurately calculate long-haul distance between Delhi and Bangalore (~1740 km)', () => {
      const distance = calculateDistance(delhi, bangalore, { unit: 'km', decimals: 0 });
      assert.ok(distance > 1700 && distance < 1780, `Expected ~1740 km, got ${distance}`);
    });

    it('should correctly convert units to meters and miles', () => {
      const distM = calculateDistance(delhi, noida, { unit: 'm', decimals: 0 });
      const distMiles = calculateDistance(delhi, noida, { unit: 'miles', decimals: 2 });
      const distKm = calculateDistance(delhi, noida, { unit: 'km', decimals: 2 });

      assert.ok(Math.abs(distM - distKm * 1000) < 50, 'Meters conversion mismatch');
      assert.ok(Math.abs(distMiles - distKm * 0.621371) < 0.5, 'Miles conversion mismatch');
    });

    it('should compute combined distance and duration based on traffic average speed', () => {
      const result = calculateDistanceAndDuration(delhi, noida, 30);
      assert.ok(result.distanceKm > 18 && result.distanceKm < 22);
      assert.ok(result.durationMin > 35 && result.durationMin < 45, `Expected ~40 min, got ${result.durationMin}`);
    });

    it('should reject invalid coordinates outside standard latitude/longitude boundaries', () => {
      assert.equal(isValidCoordinate({ lat: 91, lng: 0 }), false);
      assert.equal(isValidCoordinate({ lat: -91, lng: 0 }), false);
      assert.equal(isValidCoordinate({ lat: 0, lng: 181 }), false);
      assert.equal(isValidCoordinate({ lat: 0, lng: -181 }), false);
      assert.throws(() => normalizeCoordinates({ lat: 100, lng: 50 }, 'Test'), /latitude/);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 2. Fare Calculation Unit Tests
  // ═════════════════════════════════════════════════════════════════════════
  describe('2. Fare Calculation Unit Tests', () => {
    it('should verify configured fare rates across all vehicle categories', () => {
      assert.deepEqual(FARE_RULES[VehicleType.STANDARD], { baseFare: 30, ratePerKm: 12 });
      assert.deepEqual(FARE_RULES[VehicleType.PREMIUM], { baseFare: 60, ratePerKm: 20 });
      assert.deepEqual(FARE_RULES[VehicleType.XL], { baseFare: 50, ratePerKm: 16 });
    });

    it('should compute base fare when distance is 0 km', () => {
      const standardFare = fareService.calculateFareBreakdown(0, VehicleType.STANDARD);
      assert.equal(standardFare.totalFare, 30);
      assert.equal(standardFare.distanceFare, 0);

      const premiumFare = fareService.calculateFareBreakdown(0, VehicleType.PREMIUM);
      assert.equal(premiumFare.totalFare, 60);

      const xlFare = fareService.calculateFareBreakdown(0, VehicleType.XL);
      assert.equal(xlFare.totalFare, 50);
    });

    it('should compute accurate formula baseFare + (distanceKm * ratePerKm) for 10 km', () => {
      // STANDARD: 30 + (10 * 12) = 150
      const standard = fareService.calculateFareBreakdown(10, VehicleType.STANDARD);
      assert.equal(standard.totalFare, 150);
      assert.equal(standard.distanceFare, 120);

      // PREMIUM: 60 + (10 * 20) = 260
      const premium = fareService.calculateFareBreakdown(10, VehicleType.PREMIUM);
      assert.equal(premium.totalFare, 260);
      assert.equal(premium.distanceFare, 200);

      // XL: 50 + (10 * 16) = 210
      const xl = fareService.calculateFareBreakdown(10, VehicleType.XL);
      assert.equal(xl.totalFare, 210);
      assert.equal(xl.distanceFare, 160);
    });

    it('should calculate fractional distance accurately with 2 decimal precision', () => {
      // 7.45 km with STANDARD: 30 + (7.45 * 12) = 30 + 89.4 = 119.40
      const fare = fareService.calculateFareBreakdown(7.45, VehicleType.STANDARD);
      assert.equal(fare.totalFare, 119.4);
      assert.equal(fare.distanceFare, 89.4);
    });

    it('should reject negative distances with 400 AppError', () => {
      assert.throws(
        () => fareService.calculateFareBreakdown(-5, VehicleType.STANDARD),
        (err: any) => err instanceof AppError && err.statusCode === 400
      );
    });

    it('should calculate fare breakdown directly from geographical locations', () => {
      const pickup = { lat: 28.6139, lng: 77.209 };
      const dropoff = { lat: 28.5355, lng: 77.391 };
      const estimate = fareService.estimateFareFromLocations(pickup, dropoff, VehicleType.STANDARD);

      assert.ok(estimate.distanceKm > 18 && estimate.distanceKm < 22);
      assert.equal(estimate.baseFare, 30);
      assert.equal(estimate.totalFare, parseFloat((30 + estimate.distanceKm * 12).toFixed(2)));
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 3. Driver Matching Unit Tests
  // ═════════════════════════════════════════════════════════════════════════
  describe('3. Driver Matching Unit Tests', () => {
    const pickup = { lat: 28.6139, lng: 77.209 };
    const mockDrivers = [
      { id: 'd-far', name: 'Far Driver', isAvailable: true, currentLat: 28.75, currentLng: 77.35 },    // ~20 km
      { id: 'd-close', name: 'Close Driver', isAvailable: true, currentLat: 28.62, currentLng: 77.21 }, // ~1 km
      { id: 'd-mid', name: 'Mid Driver', isAvailable: true, currentLat: 28.65, currentLng: 77.25 },     // ~5.5 km
      { id: 'd-offline', name: 'Offline Driver', isAvailable: false, currentLat: 28.615, currentLng: 77.21 }, // ~0.2 km but offline
    ];

    const getDriverCoords = (d: any) =>
      d.isAvailable ? { lat: d.currentLat, lng: d.currentLng } : null;

    it('should filter drivers within radius and exclude offline drivers', () => {
      const within10Km = filterByRadius(pickup, mockDrivers, getDriverCoords, 10);
      const ids = within10Km.map((d: any) => d.id);

      assert.ok(ids.includes('d-close'));
      assert.ok(ids.includes('d-mid'));
      assert.ok(!ids.includes('d-far'), 'Far driver should be excluded');
      assert.ok(!ids.includes('d-offline'), 'Offline driver should be excluded');
    });

    it('should sort drivers by distance in ascending order', () => {
      const sorted = sortByDistance(pickup, mockDrivers, getDriverCoords);
      const ids = sorted.map((d: any) => d.id);

      assert.equal(ids[0], 'd-close');
      assert.equal(ids[1], 'd-mid');
      assert.equal(ids[2], 'd-far');
      assert.ok(!ids.includes('d-offline'));
    });

    it('should find single nearest driver', () => {
      const nearest = findNearest(pickup, mockDrivers, getDriverCoords, 10);
      assert.ok(nearest);
      assert.equal(nearest.id, 'd-close');
    });

    it('should return null when nearest driver exceeds search radius', () => {
      const nearest = findNearest(pickup, mockDrivers, getDriverCoords, 0.5); // Nothing within 500m
      assert.equal(nearest, null);
    });

    it('should validate driver eligibility rejecting unavailable drivers', async () => {
      const originalFindUnique = prisma.driver.findUnique;
      prisma.driver.findUnique = (async () => ({
        id: 'd-busy',
        isAvailable: false,
        currentLat: 28.6,
        currentLng: 77.2,
      })) as any;

      try {
        const eligibility = await matchingService.validateDriverAvailability('d-busy');
        assert.equal(eligibility.isEligible, false);
        assert.equal(eligibility.reason, 'Driver is currently unavailable');
      } finally {
        prisma.driver.findUnique = originalFindUnique;
      }
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 4. Ride-State Transitions Unit Tests
  // ═════════════════════════════════════════════════════════════════════════
  describe('4. Ride-State Transitions Unit Tests', () => {
    const mockDriverUser = { id: 'user-d1' };
    const mockDriverProfile = { id: 'driver-p1', userId: 'user-d1', isAvailable: false };

    it('should enforce state flow: ACCEPTED -> IN_PROGRESS via startRide', async () => {
      const originalDriverFind = prisma.driver.findUnique;
      const originalRideFind = prisma.ride.findUnique;
      const originalTx = prisma.$transaction;

      prisma.driver.findUnique = (async () => mockDriverProfile) as any;
      prisma.ride.findUnique = (async () => ({
        id: 'ride-1',
        driverId: 'driver-p1',
        status: RideStatus.ACCEPTED,
      })) as any;

      let rideUpdated = false;
      let driverMarkedUnavailable = false;

      prisma.$transaction = (async (ops: any) => {
        rideUpdated = true;
        driverMarkedUnavailable = true;
        return [
          { id: 'ride-1', status: RideStatus.IN_PROGRESS },
          { id: 'driver-p1', isAvailable: false },
        ];
      }) as any;

      try {
        const result = await rideService.startRide('ride-1', 'user-d1');
        assert.equal(result.status, RideStatus.IN_PROGRESS);
        assert.equal(rideUpdated, true);
        assert.equal(driverMarkedUnavailable, true);
      } finally {
        prisma.driver.findUnique = originalDriverFind;
        prisma.ride.findUnique = originalRideFind;
        prisma.$transaction = originalTx;
      }
    });

    it('should enforce state flow: IN_PROGRESS -> COMPLETED via completeRide and free driver', async () => {
      const originalDriverFind = prisma.driver.findUnique;
      const originalRideFind = prisma.ride.findUnique;
      const originalTx = prisma.$transaction;

      prisma.driver.findUnique = (async () => mockDriverProfile) as any;
      prisma.ride.findUnique = (async () => ({
        id: 'ride-1',
        driverId: 'driver-p1',
        status: RideStatus.IN_PROGRESS,
      })) as any;

      prisma.$transaction = (async () => [
        { id: 'ride-1', status: RideStatus.COMPLETED },
        { id: 'driver-p1', isAvailable: true },
      ]) as any;

      try {
        const result = await rideService.completeRide('ride-1', 'user-d1');
        assert.equal(result.status, RideStatus.COMPLETED);
      } finally {
        prisma.driver.findUnique = originalDriverFind;
        prisma.ride.findUnique = originalRideFind;
        prisma.$transaction = originalTx;
      }
    });

    it('should reject invalid transition when starting ride from non-ACCEPTED status', async () => {
      const originalDriverFind = prisma.driver.findUnique;
      const originalRideFind = prisma.ride.findUnique;

      prisma.driver.findUnique = (async () => mockDriverProfile) as any;
      prisma.ride.findUnique = (async () => ({
        id: 'ride-1',
        driverId: 'driver-p1',
        status: RideStatus.REQUESTED, // Invalid state for startRide
      })) as any;

      try {
        await assert.rejects(
          async () => rideService.startRide('ride-1', 'user-d1'),
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.equal(err.statusCode, 400);
            assert.ok(err.message.includes('Expected: ACCEPTED'));
            return true;
          }
        );
      } finally {
        prisma.driver.findUnique = originalDriverFind;
        prisma.ride.findUnique = originalRideFind;
      }
    });

    it('should reject unauthorized driver attempting to complete a ride', async () => {
      const originalDriverFind = prisma.driver.findUnique;
      const originalRideFind = prisma.ride.findUnique;

      prisma.driver.findUnique = (async () => ({ id: 'driver-p2', userId: 'user-intruder' })) as any;
      prisma.ride.findUnique = (async () => ({
        id: 'ride-1',
        driverId: 'driver-p1', // Assigned to p1
        status: RideStatus.IN_PROGRESS,
      })) as any;

      try {
        await assert.rejects(
          async () => rideService.completeRide('ride-1', 'user-intruder'),
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.equal(err.statusCode, 403);
            assert.ok(err.message.includes('Forbidden'));
            return true;
          }
        );
      } finally {
        prisma.driver.findUnique = originalDriverFind;
        prisma.ride.findUnique = originalRideFind;
      }
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 5. Validation Rules Across Domains Unit Tests
  // ═════════════════════════════════════════════════════════════════════════
  describe('5. Validation Rules Across Domains Unit Tests', () => {
    it('should reject invalid role in registerSchema', () => {
      assert.throws(
        () => registerSchema.parse({
          name: 'Bob',
          email: 'bob@example.com',
          password: 'password123',
          role: 'SUPERADMIN',
        }),
        /role/
      );
    });

    it('should reject invalid coordinates in updateLocationSchema', () => {
      assert.throws(() => updateLocationSchema.parse({ lat: -95, lng: 50 }), /Latitude/);
      assert.throws(() => updateLocationSchema.parse({ lat: 45, lng: 185 }), /Longitude/);
    });

    it('should reject invalid vehicleType in estimateFareFromLocationsSchema', () => {
      assert.throws(
        () => estimateFareFromLocationsSchema.parse({
          pickupLat: 28.6,
          pickupLng: 77.2,
          dropoffLat: 28.7,
          dropoffLng: 77.3,
          vehicleType: 'HELICOPTER',
        }),
        /vehicleType/
      );
    });

    it('should validate integer bounds for rating in createFeedbackSchema', () => {
      assert.equal(createFeedbackSchema.parse({ rating: 1 }).rating, 1);
      assert.equal(createFeedbackSchema.parse({ rating: 5 }).rating, 5);
      assert.throws(() => createFeedbackSchema.parse({ rating: 0 }), /Rating must be at least 1/);
      assert.throws(() => createFeedbackSchema.parse({ rating: 6 }), /Rating cannot exceed 5/);
    });

    it('should validate non-empty string in idParamSchema', () => {
      assert.equal(idParamSchema.parse({ id: 'c-uuid-1234' }).id, 'c-uuid-1234');
      assert.throws(() => idParamSchema.parse({ id: '  ' }), /ID parameter cannot be empty/);
    });
  });
});
