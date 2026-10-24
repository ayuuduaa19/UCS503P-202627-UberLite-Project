import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Role, RideStatus, VehicleType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { authorize } from '../middleware/auth.middleware';
import {
  updateAvailabilitySchema,
  updateLocationSchema,
  updateDriverStatusSchema,
} from '../validators/driver.validator';
import { driverService } from '../services/driver.service';
import { rideService } from '../services/ride.service';
import { matchingService } from '../services/matching.service';
import {
  getDriverAvailability,
  updateAvailability,
  getDriverLocation,
  updateLocation,
  updateDriverStatus,
} from '../controllers/driver.controller';
import { getRideTracking } from '../controllers/passenger.controller';

// Helper to create mock Express response object
const createMockResponse = () => {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
  };
  return res;
};

describe('Driver Availability and Location Management', () => {
  describe('Zod Validation Schemas', () => {
    it('updateAvailabilitySchema should accept valid boolean flags', () => {
      const validTrue = updateAvailabilitySchema.safeParse({ isAvailable: true });
      assert.strictEqual(validTrue.success, true);
      if (validTrue.success) {
        assert.strictEqual(validTrue.data.isAvailable, true);
      }

      const validFalse = updateAvailabilitySchema.safeParse({ isAvailable: false });
      assert.strictEqual(validFalse.success, true);
      if (validFalse.success) {
        assert.strictEqual(validFalse.data.isAvailable, false);
      }
    });

    it('updateAvailabilitySchema should reject non-boolean or missing values', () => {
      const missing = updateAvailabilitySchema.safeParse({});
      assert.strictEqual(missing.success, false);

      const stringVal = updateAvailabilitySchema.safeParse({ isAvailable: 'true' });
      assert.strictEqual(stringVal.success, false);

      const numVal = updateAvailabilitySchema.safeParse({ isAvailable: 1 });
      assert.strictEqual(numVal.success, false);
    });

    it('updateLocationSchema should accept valid latitude and longitude coordinates', () => {
      const valid = updateLocationSchema.safeParse({
        currentLat: 28.6139,
        currentLng: 77.209,
      });
      assert.strictEqual(valid.success, true);
      if (valid.success) {
        assert.strictEqual(valid.data.currentLat, 28.6139);
        assert.strictEqual(valid.data.currentLng, 77.209);
      }
    });

    it('updateLocationSchema should reject out-of-range coordinates', () => {
      const latTooHigh = updateLocationSchema.safeParse({
        currentLat: 91,
        currentLng: 77.209,
      });
      assert.strictEqual(latTooHigh.success, false);

      const latTooLow = updateLocationSchema.safeParse({
        currentLat: -91,
        currentLng: 77.209,
      });
      assert.strictEqual(latTooLow.success, false);

      const lngTooHigh = updateLocationSchema.safeParse({
        currentLat: 28.6139,
        currentLng: 181,
      });
      assert.strictEqual(lngTooHigh.success, false);

      const lngTooLow = updateLocationSchema.safeParse({
        currentLat: 28.6139,
        currentLng: -181,
      });
      assert.strictEqual(lngTooLow.success, false);
    });

    it('updateLocationSchema should reject missing or non-numeric coordinates', () => {
      const missingLng = updateLocationSchema.safeParse({ currentLat: 28.6139 });
      assert.strictEqual(missingLng.success, false);

      const nonNumeric = updateLocationSchema.safeParse({
        currentLat: '28.6139',
        currentLng: 77.209,
      });
      assert.strictEqual(nonNumeric.success, false);
    });

    it('updateDriverStatusSchema should allow partial status updates and combined updates', () => {
      // Availability only
      const availOnly = updateDriverStatusSchema.safeParse({ isAvailable: true });
      assert.strictEqual(availOnly.success, true);

      // Location only
      const locOnly = updateDriverStatusSchema.safeParse({
        currentLat: 12.9716,
        currentLng: 77.5946,
      });
      assert.strictEqual(locOnly.success, true);

      // Both availability and location
      const both = updateDriverStatusSchema.safeParse({
        isAvailable: false,
        currentLat: 19.076,
        currentLng: 72.8777,
      });
      assert.strictEqual(both.success, true);

      // Empty payload should fail
      const empty = updateDriverStatusSchema.safeParse({});
      assert.strictEqual(empty.success, false);

      // Incomplete coordinates should fail
      const partialCoord = updateDriverStatusSchema.safeParse({
        currentLat: 12.9716,
      });
      assert.strictEqual(partialCoord.success, false);
    });
  });

  describe('DriverService Logic', () => {
    it('getAvailabilityAndLocation should return driver availability and current coordinates', async () => {
      const originalFindUnique = prisma.driver.findUnique;
      const mockDriver = {
        id: 'driver-id-123',
        userId: 'user-driver-1',
        isAvailable: true,
        currentLat: 28.7041,
        currentLng: 77.1025,
        updatedAt: new Date('2026-09-15T12:00:00Z'),
      };

      prisma.driver.findUnique = (async (args: any) => {
        if (args.where.userId === 'user-driver-1') return mockDriver as any;
        return null;
      }) as any;

      try {
        const result = await driverService.getAvailabilityAndLocation('user-driver-1');
        assert.strictEqual(result.driverId, 'driver-id-123');
        assert.strictEqual(result.userId, 'user-driver-1');
        assert.strictEqual(result.isAvailable, true);
        assert.strictEqual(result.currentLat, 28.7041);
        assert.strictEqual(result.currentLng, 77.1025);
      } finally {
        prisma.driver.findUnique = originalFindUnique;
      }
    });

    it('getAvailabilityAndLocation should throw 404 AppError when driver profile does not exist', async () => {
      const originalFindUnique = prisma.driver.findUnique;
      prisma.driver.findUnique = (async () => null) as any;

      try {
        await assert.rejects(
          async () => {
            await driverService.getAvailabilityAndLocation('non-existent-user');
          },
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.strictEqual(err.statusCode, 404);
            assert.strictEqual(err.message, 'Driver profile not found');
            return true;
          }
        );
      } finally {
        prisma.driver.findUnique = originalFindUnique;
      }
    });

    it('updateAvailability should update driver availability flag in database', async () => {
      const originalFindUnique = prisma.driver.findUnique;
      const originalUpdate = prisma.driver.update;

      prisma.driver.findUnique = (async () => ({
        id: 'driver-id-123',
        userId: 'user-driver-1',
        isAvailable: false,
      })) as any;

      prisma.driver.update = (async (args: any) => {
        return {
          id: 'driver-id-123',
          userId: 'user-driver-1',
          isAvailable: args.data.isAvailable,
        };
      }) as any;

      try {
        const result = await driverService.updateAvailability('user-driver-1', true);
        assert.strictEqual(result.isAvailable, true);
      } finally {
        prisma.driver.findUnique = originalFindUnique;
        prisma.driver.update = originalUpdate;
      }
    });

    it('updateAvailability should optionally update coordinates if provided', async () => {
      const originalFindUnique = prisma.driver.findUnique;
      const originalUpdate = prisma.driver.update;

      let capturedData: any = null;
      prisma.driver.findUnique = (async () => ({
        id: 'driver-id-123',
        userId: 'user-driver-1',
        isAvailable: false,
      })) as any;

      prisma.driver.update = (async (args: any) => {
        capturedData = args.data;
        return {
          id: 'driver-id-123',
          ...args.data,
        };
      }) as any;

      try {
        const result = await driverService.updateAvailability('user-driver-1', true, {
          currentLat: 28.5,
          currentLng: 77.2,
        });
        assert.strictEqual(capturedData.isAvailable, true);
        assert.strictEqual(capturedData.currentLat, 28.5);
        assert.strictEqual(capturedData.currentLng, 77.2);
        assert.strictEqual(result.isAvailable, true);
      } finally {
        prisma.driver.findUnique = originalFindUnique;
        prisma.driver.update = originalUpdate;
      }
    });

    it('updateLocation should update currentLat and currentLng in database', async () => {
      const originalFindUnique = prisma.driver.findUnique;
      const originalUpdate = prisma.driver.update;

      let updatedFields: any = null;
      prisma.driver.findUnique = (async () => ({
        id: 'driver-id-123',
        userId: 'user-driver-1',
      })) as any;

      prisma.driver.update = (async (args: any) => {
        updatedFields = args.data;
        return {
          id: 'driver-id-123',
          userId: 'user-driver-1',
          ...args.data,
        };
      }) as any;

      try {
        const result = await driverService.updateLocation('user-driver-1', {
          currentLat: 28.6139,
          currentLng: 77.209,
        });
        assert.strictEqual(updatedFields.currentLat, 28.6139);
        assert.strictEqual(updatedFields.currentLng, 77.209);
        assert.strictEqual(result.currentLat, 28.6139);
        assert.strictEqual(result.currentLng, 77.209);
      } finally {
        prisma.driver.findUnique = originalFindUnique;
        prisma.driver.update = originalUpdate;
      }
    });

    it('updateStatus should update availability and location simultaneously', async () => {
      const originalFindUnique = prisma.driver.findUnique;
      const originalUpdate = prisma.driver.update;

      prisma.driver.findUnique = (async () => ({
        id: 'driver-id-123',
        userId: 'user-driver-1',
      })) as any;

      prisma.driver.update = (async (args: any) => ({
        id: 'driver-id-123',
        userId: 'user-driver-1',
        ...args.data,
      })) as any;

      try {
        const result = await driverService.updateStatus('user-driver-1', {
          isAvailable: true,
          currentLat: 13.0827,
          currentLng: 80.2707,
        });
        assert.strictEqual(result.isAvailable, true);
        assert.strictEqual(result.currentLat, 13.0827);
        assert.strictEqual(result.currentLng, 80.2707);
      } finally {
        prisma.driver.findUnique = originalFindUnique;
        prisma.driver.update = originalUpdate;
      }
    });
  });

  describe('Driver Controller Handlers', () => {
    it('getDriverAvailability should respond with 200 and availability data', async () => {
      const originalFindUnique = prisma.driver.findUnique;
      prisma.driver.findUnique = (async () => ({
        id: 'd-1',
        userId: 'driver-u1',
        isAvailable: true,
        currentLat: 28.6,
        currentLng: 77.2,
        updatedAt: new Date(),
      })) as any;

      try {
        const req: any = { user: { id: 'driver-u1', role: Role.DRIVER } };
        const res = createMockResponse();

        await getDriverAvailability(req, res, (err) => {
          if (err) throw err;
        });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.availability.isAvailable, true);
        assert.strictEqual(res.body.data.availability.currentLat, 28.6);
      } finally {
        prisma.driver.findUnique = originalFindUnique;
      }
    });

    it('updateAvailability should respond with 200 and updated status message', async () => {
      const originalFindUnique = prisma.driver.findUnique;
      const originalUpdate = prisma.driver.update;

      prisma.driver.findUnique = (async () => ({
        id: 'd-1',
        userId: 'driver-u1',
        isAvailable: false,
      })) as any;

      prisma.driver.update = (async (args: any) => ({
        id: 'd-1',
        userId: 'driver-u1',
        ...args.data,
      })) as any;

      try {
        const req: any = {
          user: { id: 'driver-u1', role: Role.DRIVER },
          body: { isAvailable: true },
        };
        const res = createMockResponse();

        await updateAvailability(req, res, (err) => {
          if (err) throw err;
        });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.message, 'Driver status updated to available');
        assert.strictEqual(res.body.data.driver.isAvailable, true);
      } finally {
        prisma.driver.findUnique = originalFindUnique;
        prisma.driver.update = originalUpdate;
      }
    });

    it('updateAvailability should reject non-boolean isAvailable with 400 AppError', async () => {
      const req: any = {
        user: { id: 'driver-u1', role: Role.DRIVER },
        body: { isAvailable: 'not-a-bool' },
      };
      const res = createMockResponse();
      let errorPassed: any = null;

      await updateAvailability(req, res, (err) => {
        errorPassed = err;
      });

      assert.ok(errorPassed instanceof AppError);
      assert.strictEqual(errorPassed.statusCode, 400);
      assert.strictEqual(errorPassed.message, 'Field isAvailable must be a boolean');
    });

    it('getDriverLocation should respond with 200 and coordinates data', async () => {
      const originalFindUnique = prisma.driver.findUnique;
      prisma.driver.findUnique = (async () => ({
        id: 'd-1',
        userId: 'driver-u1',
        isAvailable: true,
        currentLat: 19.076,
        currentLng: 72.8777,
        updatedAt: new Date(),
      })) as any;

      try {
        const req: any = { user: { id: 'driver-u1', role: Role.DRIVER } };
        const res = createMockResponse();

        await getDriverLocation(req, res, (err) => {
          if (err) throw err;
        });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.location.currentLat, 19.076);
        assert.strictEqual(res.body.data.location.currentLng, 72.8777);
        assert.strictEqual(res.body.data.location.isAvailable, true);
      } finally {
        prisma.driver.findUnique = originalFindUnique;
      }
    });

    it('updateLocation should update coordinates and return 200', async () => {
      const originalFindUnique = prisma.driver.findUnique;
      const originalUpdate = prisma.driver.update;

      prisma.driver.findUnique = (async () => ({
        id: 'd-1',
        userId: 'driver-u1',
      })) as any;

      prisma.driver.update = (async (args: any) => ({
        id: 'd-1',
        userId: 'driver-u1',
        currentLat: args.data.currentLat,
        currentLng: args.data.currentLng,
      })) as any;

      try {
        const req: any = {
          user: { id: 'driver-u1', role: Role.DRIVER },
          body: { currentLat: 12.9716, currentLng: 77.5946 },
        };
        const res = createMockResponse();

        await updateLocation(req, res, (err) => {
          if (err) throw err;
        });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.message, 'Driver location updated successfully');
        assert.strictEqual(res.body.data.driver.currentLat, 12.9716);
        assert.strictEqual(res.body.data.driver.currentLng, 77.5946);
      } finally {
        prisma.driver.findUnique = originalFindUnique;
        prisma.driver.update = originalUpdate;
      }
    });

    it('updateDriverStatus should update status and return 200', async () => {
      const originalFindUnique = prisma.driver.findUnique;
      const originalUpdate = prisma.driver.update;

      prisma.driver.findUnique = (async () => ({
        id: 'd-1',
        userId: 'driver-u1',
      })) as any;

      prisma.driver.update = (async (args: any) => ({
        id: 'd-1',
        userId: 'driver-u1',
        ...args.data,
      })) as any;

      try {
        const req: any = {
          user: { id: 'driver-u1', role: Role.DRIVER },
          body: { isAvailable: true, currentLat: 28.6139, currentLng: 77.209 },
        };
        const res = createMockResponse();

        await updateDriverStatus(req, res, (err) => {
          if (err) throw err;
        });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.message, 'Driver status updated successfully');
        assert.strictEqual(res.body.data.driver.isAvailable, true);
        assert.strictEqual(res.body.data.driver.currentLat, 28.6139);
      } finally {
        prisma.driver.findUnique = originalFindUnique;
        prisma.driver.update = originalUpdate;
      }
    });
  });

  describe('Role-Based Access Control on Driver Endpoints', () => {
    it('should restrict driver routes to authenticated users with DRIVER role', () => {
      const driverAuthMiddleware = authorize(Role.DRIVER);

      // 1. Unauthenticated request
      const unauthReq: any = {};
      const res = createMockResponse();
      let unauthErr: any = null;
      driverAuthMiddleware(unauthReq, res, (err) => {
        unauthErr = err;
      });
      assert.ok(unauthErr instanceof AppError);
      assert.strictEqual(unauthErr.statusCode, 401);

      // 2. PASSENGER role
      const passengerReq: any = {
        user: { id: 'p-1', role: Role.PASSENGER },
      };
      let forbiddenErr: any = null;
      driverAuthMiddleware(passengerReq, res, (err) => {
        forbiddenErr = err;
      });
      assert.ok(forbiddenErr instanceof AppError);
      assert.strictEqual(forbiddenErr.statusCode, 403);

      // 3. DRIVER role allowed
      const driverReq: any = {
        user: { id: 'd-1', role: Role.DRIVER },
      };
      let allowed = false;
      driverAuthMiddleware(driverReq, res, (err) => {
        if (!err) allowed = true;
      });
      assert.strictEqual(allowed, true);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Task 43: Periodic Driver Location Updates, Live Tracking & Matching Optimization
  // ═════════════════════════════════════════════════════════════════════════
  describe('Task 43: Periodic Driver Location Updates & Live Ride Tracking', () => {
    it('should update periodic driver location telemetry and confirm timestamp', async () => {
      const originalFindUnique = prisma.driver.findUnique;
      const originalUpdate = prisma.driver.update;
      const now = new Date();

      prisma.driver.findUnique = (async () => ({
        id: 'd-periodic-1',
        userId: 'u-driver-1',
        currentLat: 28.6139,
        currentLng: 77.209,
      })) as any;

      prisma.driver.update = (async (args: any) => ({
        id: 'd-periodic-1',
        userId: 'u-driver-1',
        currentLat: args.data.currentLat,
        currentLng: args.data.currentLng,
        isAvailable: true,
        updatedAt: now,
      })) as any;

      try {
        const result = await driverService.updatePeriodicLocation('u-driver-1', 28.625, 77.218);
        assert.strictEqual(result.currentLat, 28.625);
        assert.strictEqual(result.currentLng, 77.218);
        assert.strictEqual(result.recordedAt, now);
        assert.strictEqual(result.driver.id, 'd-periodic-1');
      } finally {
        prisma.driver.findUnique = originalFindUnique;
        prisma.driver.update = originalUpdate;
      }
    });

    it('should compute real-time ride tracking telemetry when driver is heading to pickup', async () => {
      const originalFindUnique = prisma.ride.findUnique;
      const driverUpdatedAt = new Date('2026-10-24T09:00:00Z');

      prisma.ride.findUnique = (async () => ({
        id: 'r-track-1',
        passengerId: 'p-1',
        driverId: 'd-1',
        pickupLat: 28.6315,
        pickupLng: 77.2167,
        pickupAddress: 'Connaught Place',
        dropoffLat: 28.4952,
        dropoffLng: 77.0895,
        dropoffAddress: 'Cyber City',
        status: RideStatus.ACCEPTED,
        distanceKm: 20.0,
        durationMin: 35.0,
        driver: {
          id: 'd-1',
          vehicleModel: 'Honda City',
          vehiclePlate: 'DL-01-AB-1234',
          vehicleColor: 'Silver',
          vehicleType: VehicleType.STANDARD,
          rating: 4.9,
          currentLat: 28.6200, // ~1.3 km away from pickup
          currentLng: 77.2150,
          updatedAt: driverUpdatedAt,
          user: { name: 'Rajesh Driver', phone: '+919876543210' },
        },
        passenger: { id: 'p-1', name: 'Passenger One' },
        fare: null,
      })) as any;

      try {
        const res = await rideService.getRideTracking('r-track-1', 'p-1');
        assert.strictEqual(res.ride.id, 'r-track-1');
        assert.ok(res.tracking, 'Tracking data should be populated');
        assert.strictEqual(res.tracking.targetType, 'PICKUP');
        assert.strictEqual(res.tracking.targetAddress, 'Connaught Place');
        assert.ok(res.tracking.driverDistanceToTargetKm > 1.0 && res.tracking.driverDistanceToTargetKm < 2.0);
        assert.ok(res.tracking.estimatedArrivalMin > 0);
        assert.strictEqual(res.tracking.driverCurrentLocation.lat, 28.6200);
      } finally {
        prisma.ride.findUnique = originalFindUnique;
      }
    });

    it('should compute real-time ride tracking telemetry towards dropoff during IN_PROGRESS trip', async () => {
      const originalFindUnique = prisma.ride.findUnique;

      prisma.ride.findUnique = (async () => ({
        id: 'r-track-progress',
        passengerId: 'p-1',
        driverId: 'd-1',
        pickupLat: 28.6315,
        pickupLng: 77.2167,
        pickupAddress: 'Connaught Place',
        dropoffLat: 28.4952,
        dropoffLng: 77.0895,
        dropoffAddress: 'Cyber City',
        status: RideStatus.IN_PROGRESS,
        distanceKm: 20.0,
        driver: {
          id: 'd-1',
          vehicleModel: 'Honda City',
          vehiclePlate: 'DL-01-AB-1234',
          rating: 4.9,
          currentLat: 28.5200, // closer to dropoff
          currentLng: 77.1000,
          updatedAt: new Date(),
          user: { name: 'Rajesh Driver', phone: '+919876543210' },
        },
        passenger: { id: 'p-1' },
      })) as any;

      try {
        const res = await rideService.getRideTracking('r-track-progress', 'p-1');
        assert.strictEqual(res.tracking?.targetType, 'DROPOFF');
        assert.strictEqual(res.tracking?.targetAddress, 'Cyber City');
        assert.ok(res.tracking!.driverDistanceToTargetKm > 0);
      } finally {
        prisma.ride.findUnique = originalFindUnique;
      }
    });

    it('should reject ride tracking for unauthorized passengers', async () => {
      const originalFindUnique = prisma.ride.findUnique;

      prisma.ride.findUnique = (async () => ({
        id: 'r-unauth',
        passengerId: 'p-owner',
        status: RideStatus.ACCEPTED,
        driver: { id: 'd-1', currentLat: 28.6, currentLng: 77.2 },
      })) as any;

      try {
        await assert.rejects(
          async () => {
            await rideService.getRideTracking('r-unauth', 'p-intruder');
          },
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.strictEqual(err.statusCode, 403);
            return true;
          }
        );
      } finally {
        prisma.ride.findUnique = originalFindUnique;
      }
    });

    it('should optimize driver matching by prioritizing drivers with fresher location updates on distance tie', async () => {
      const originalFindMany = prisma.driver.findMany;
      const pickup = { lat: 28.6315, lng: 77.2167 };
      const staleTime = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
      const freshTime = new Date(Date.now() - 5 * 1000); // 5 seconds ago

      prisma.driver.findMany = (async () => [
        {
          id: 'd-stale',
          userId: 'u-stale',
          isAvailable: true,
          currentLat: 28.6315, // exactly at pickup (0 km)
          currentLng: 77.2167,
          rating: 4.8,
          licenseNumber: 'DL-STALE',
          vehicleType: VehicleType.STANDARD,
          vehicleModel: 'Maruti Dzire',
          vehiclePlate: 'DL-01-ST-0001',
          vehicleColor: 'White',
          updatedAt: staleTime,
          user: { name: 'Stale Driver', phone: '1111' },
        },
        {
          id: 'd-fresh',
          userId: 'u-fresh',
          isAvailable: true,
          currentLat: 28.6315, // identical distance (0 km)
          currentLng: 77.2167,
          rating: 4.8,
          licenseNumber: 'DL-FRESH',
          vehicleType: VehicleType.STANDARD,
          vehicleModel: 'Hyundai Aura',
          vehiclePlate: 'DL-01-FR-0002',
          vehicleColor: 'Silver',
          updatedAt: freshTime,
          user: { name: 'Fresh Driver', phone: '2222' },
        },
      ]) as any;

      try {
        const candidates = await matchingService.findAvailableDrivers(pickup);
        assert.strictEqual(candidates.length, 2);
        // The driver with the more recent periodic location update must be sorted first!
        assert.strictEqual(candidates[0].driverId, 'd-fresh');
        assert.strictEqual(candidates[1].driverId, 'd-stale');
      } finally {
        prisma.driver.findMany = originalFindMany;
      }
    });

    it('GET /api/passenger/rides/:id/track controller should return tracking data', async () => {
      const originalGetTracking = rideService.getRideTracking;
      rideService.getRideTracking = async () => ({
        ride: { id: 'r-api-track' } as any,
        tracking: {
          driverDistanceToTargetKm: 1.5,
          estimatedArrivalMin: 4,
          targetType: 'PICKUP',
        } as any,
      });

      const req: any = {
        params: { id: 'r-api-track' },
        user: { id: 'p-1', role: Role.PASSENGER },
      };
      const res = createMockResponse();

      try {
        await getRideTracking(req, res, () => {});
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.tracking.driverDistanceToTargetKm, 1.5);
      } finally {
        rideService.getRideTracking = originalGetTracking;
      }
    });
  });
});
