import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Role, RideStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { authorize } from '../middleware/auth.middleware';
import { createRideSchema } from '../validators/ride.validator';
import { rideService } from '../services/ride.service';
import {
  requestRide,
  getPassengerRides,
  getRideDetails,
} from '../controllers/passenger.controller';

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

describe('Ride Data Model & Ride Creation', () => {
  describe('Zod Validation - createRideSchema', () => {
    it('should validate valid ride request with complete addresses and coordinates', () => {
      const validPayload = {
        pickupAddress: 'Connaught Place, New Delhi',
        dropoffAddress: 'Cyber City, Gurugram',
        pickupLat: 28.6315,
        pickupLng: 77.2167,
        dropoffLat: 28.4952,
        dropoffLng: 77.0895,
        distanceKm: 28.5,
        durationMin: 40.0,
      };

      const result = createRideSchema.safeParse(validPayload);
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.pickupAddress, 'Connaught Place, New Delhi');
        assert.strictEqual(result.data.dropoffAddress, 'Cyber City, Gurugram');
        assert.strictEqual(result.data.pickupLat, 28.6315);
        assert.strictEqual(result.data.pickupLng, 77.2167);
        assert.strictEqual(result.data.dropoffLat, 28.4952);
        assert.strictEqual(result.data.dropoffLng, 77.0895);
        assert.strictEqual(result.data.distanceKm, 28.5);
        assert.strictEqual(result.data.durationMin, 40.0);
      }
    });

    it('should default coordinates to 0.0 when coordinates are omitted', () => {
      const payloadWithoutCoords = {
        pickupAddress: 'Railway Station',
        dropoffAddress: 'Airport Terminal 3',
      };

      const result = createRideSchema.safeParse(payloadWithoutCoords);
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.pickupLat, 0.0);
        assert.strictEqual(result.data.pickupLng, 0.0);
        assert.strictEqual(result.data.dropoffLat, 0.0);
        assert.strictEqual(result.data.dropoffLng, 0.0);
      }
    });

    it('should reject missing or empty pickupAddress', () => {
      const missingPickup = createRideSchema.safeParse({
        dropoffAddress: 'Cyber City',
      });
      assert.strictEqual(missingPickup.success, false);

      const emptyPickup = createRideSchema.safeParse({
        pickupAddress: '   ',
        dropoffAddress: 'Cyber City',
      });
      assert.strictEqual(emptyPickup.success, false);
    });

    it('should reject missing or empty dropoffAddress', () => {
      const missingDropoff = createRideSchema.safeParse({
        pickupAddress: 'Connaught Place',
      });
      assert.strictEqual(missingDropoff.success, false);

      const emptyDropoff = createRideSchema.safeParse({
        pickupAddress: 'Connaught Place',
        dropoffAddress: '',
      });
      assert.strictEqual(emptyDropoff.success, false);
    });

    it('should reject out-of-range coordinates', () => {
      // pickupLat > 90
      const invalidPickupLat = createRideSchema.safeParse({
        pickupAddress: 'A',
        dropoffAddress: 'B',
        pickupLat: 95.0,
      });
      assert.strictEqual(invalidPickupLat.success, false);

      // pickupLng < -180
      const invalidPickupLng = createRideSchema.safeParse({
        pickupAddress: 'A',
        dropoffAddress: 'B',
        pickupLng: -185.0,
      });
      assert.strictEqual(invalidPickupLng.success, false);

      // dropoffLat < -90
      const invalidDropoffLat = createRideSchema.safeParse({
        pickupAddress: 'A',
        dropoffAddress: 'B',
        dropoffLat: -92.0,
      });
      assert.strictEqual(invalidDropoffLat.success, false);

      // dropoffLng > 180
      const invalidDropoffLng = createRideSchema.safeParse({
        pickupAddress: 'A',
        dropoffAddress: 'B',
        dropoffLng: 185.0,
      });
      assert.strictEqual(invalidDropoffLng.success, false);
    });

    it('should reject non-positive distanceKm or durationMin', () => {
      const negativeDist = createRideSchema.safeParse({
        pickupAddress: 'A',
        dropoffAddress: 'B',
        distanceKm: -5,
      });
      assert.strictEqual(negativeDist.success, false);

      const negativeDur = createRideSchema.safeParse({
        pickupAddress: 'A',
        dropoffAddress: 'B',
        durationMin: 0,
      });
      assert.strictEqual(negativeDur.success, false);
    });
  });

  describe('RideService Logic', () => {
    it('createRide should create a ride with initial REQUESTED status and relationships', async () => {
      const originalCreate = prisma.ride.create;
      let capturedCreateArgs: any = null;

      const mockRide = {
        id: 'ride-uuid-1',
        passengerId: 'passenger-uuid-1',
        pickupAddress: 'Sector 62, Noida',
        dropoffAddress: 'Sector 18, Noida',
        pickupLat: 28.62,
        pickupLng: 77.36,
        dropoffLat: 28.57,
        dropoffLng: 77.32,
        status: RideStatus.REQUESTED,
        distanceKm: 7.2,
        durationMin: 18.0,
        createdAt: new Date('2026-09-15T10:00:00Z'),
        updatedAt: new Date('2026-09-15T10:00:00Z'),
        passenger: {
          id: 'passenger-uuid-1',
          name: 'Alice Passenger',
          phone: '+919876543210',
          email: 'alice@uberlite.local',
        },
      };

      prisma.ride.create = (async (args: any) => {
        capturedCreateArgs = args;
        return mockRide as any;
      }) as any;

      try {
        const result = await rideService.createRide('passenger-uuid-1', {
          pickupAddress: 'Sector 62, Noida',
          dropoffAddress: 'Sector 18, Noida',
          pickupLat: 28.62,
          pickupLng: 77.36,
          dropoffLat: 28.57,
          dropoffLng: 77.32,
          distanceKm: 7.2,
          durationMin: 18.0,
        });

        assert.strictEqual(capturedCreateArgs.data.passengerId, 'passenger-uuid-1');
        assert.strictEqual(capturedCreateArgs.data.status, RideStatus.REQUESTED);
        assert.strictEqual(capturedCreateArgs.data.pickupAddress, 'Sector 62, Noida');
        assert.strictEqual(capturedCreateArgs.data.dropoffAddress, 'Sector 18, Noida');
        assert.strictEqual(result.id, 'ride-uuid-1');
        assert.strictEqual(result.status, 'REQUESTED');
        assert.strictEqual(result.passenger.name, 'Alice Passenger');
        assert.ok(result.createdAt instanceof Date);
      } finally {
        prisma.ride.create = originalCreate;
      }
    });

    it('createRide should throw 400 AppError when passengerId is missing', async () => {
      await assert.rejects(
        async () => {
          await rideService.createRide('', {
            pickupAddress: 'A',
            dropoffAddress: 'B',
            pickupLat: 0,
            pickupLng: 0,
            dropoffLat: 0,
            dropoffLng: 0,
          });
        },
        (err: any) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.statusCode, 400);
          assert.strictEqual(err.message, 'Passenger ID is required');
          return true;
        }
      );
    });

    it('getPassengerRides should return ride history for passenger', async () => {
      const originalFindMany = prisma.ride.findMany;
      prisma.ride.findMany = (async (args: any) => {
        if (args.where.passengerId === 'p-1') {
          return [
            {
              id: 'r-1',
              passengerId: 'p-1',
              status: 'COMPLETED',
              pickupAddress: 'A',
              dropoffAddress: 'B',
            },
          ] as any;
        }
        return [];
      }) as any;

      try {
        const rides = await rideService.getPassengerRides('p-1');
        assert.strictEqual(rides.length, 1);
        assert.strictEqual(rides[0].id, 'r-1');
      } finally {
        prisma.ride.findMany = originalFindMany;
      }
    });

    it('getRideById should return ride details or throw 404', async () => {
      const originalFindUnique = prisma.ride.findUnique;
      prisma.ride.findUnique = (async (args: any) => {
        if (args.where.id === 'r-found') {
          return { id: 'r-found', status: 'REQUESTED' } as any;
        }
        return null;
      }) as any;

      try {
        const found = await rideService.getRideById('r-found');
        assert.strictEqual(found.id, 'r-found');

        await assert.rejects(
          async () => {
            await rideService.getRideById('r-not-found');
          },
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.strictEqual(err.statusCode, 404);
            assert.strictEqual(err.message, 'Ride not found');
            return true;
          }
        );
      } finally {
        prisma.ride.findUnique = originalFindUnique;
      }
    });
  });

  describe('Passenger Controller - requestRide & getRideDetails', () => {
    it('requestRide should create a ride request and return 201 Created', async () => {
      const originalCreate = prisma.ride.create;
      prisma.ride.create = (async () => ({
        id: 'new-ride-id',
        passengerId: 'pass-user-1',
        pickupAddress: 'Indira Gandhi Airport',
        dropoffAddress: 'South Extension',
        pickupLat: 28.5562,
        pickupLng: 77.1000,
        dropoffLat: 28.5729,
        dropoffLng: 77.2208,
        status: 'REQUESTED',
        createdAt: new Date(),
        updatedAt: new Date(),
      })) as any;

      try {
        const req: any = {
          user: { id: 'pass-user-1', role: Role.PASSENGER },
          body: {
            pickupAddress: 'Indira Gandhi Airport',
            dropoffAddress: 'South Extension',
            pickupLat: 28.5562,
            pickupLng: 77.1000,
            dropoffLat: 28.5729,
            dropoffLng: 77.2208,
          },
        };
        const res = createMockResponse();

        await requestRide(req, res, (err) => {
          if (err) throw err;
        });

        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.message, 'Ride requested successfully');
        assert.strictEqual(res.body.data.ride.status, 'REQUESTED');
        assert.strictEqual(res.body.data.ride.id, 'new-ride-id');
      } finally {
        prisma.ride.create = originalCreate;
      }
    });

    it('requestRide should forward validation error when required addresses are missing', async () => {
      const req: any = {
        user: { id: 'pass-user-1', role: Role.PASSENGER },
        body: {
          pickupLat: 28.5,
          pickupLng: 77.1,
        },
      };
      const res = createMockResponse();
      let capturedError: any = null;

      await requestRide(req, res, (err) => {
        capturedError = err;
      });

      assert.ok(capturedError);
      assert.strictEqual(capturedError.name, 'ZodError');
    });

    it('getRideDetails should return 200 with ride object', async () => {
      const originalFindUnique = prisma.ride.findUnique;
      prisma.ride.findUnique = (async () => ({
        id: 'ride-view-1',
        status: 'REQUESTED',
        pickupAddress: 'A',
        dropoffAddress: 'B',
      })) as any;

      try {
        const req: any = {
          user: { id: 'pass-user-1', role: Role.PASSENGER },
          params: { id: 'ride-view-1' },
        };
        const res = createMockResponse();

        await getRideDetails(req, res, (err) => {
          if (err) throw err;
        });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.ride.id, 'ride-view-1');
      } finally {
        prisma.ride.findUnique = originalFindUnique;
      }
    });
  });

  describe('Role Authorization on Ride Creation Endpoints', () => {
    it('should restrict ride creation to authenticated users with PASSENGER role', () => {
      const passengerAuthMiddleware = authorize(Role.PASSENGER);

      // 1. Unauthenticated request
      const unauthReq: any = {};
      const res = createMockResponse();
      let unauthErr: any = null;
      passengerAuthMiddleware(unauthReq, res, (err) => {
        unauthErr = err;
      });
      assert.ok(unauthErr instanceof AppError);
      assert.strictEqual(unauthErr.statusCode, 401);

      // 2. DRIVER role accessing passenger ride creation
      const driverReq: any = {
        user: { id: 'driver-u1', role: Role.DRIVER },
      };
      let forbiddenErr: any = null;
      passengerAuthMiddleware(driverReq, res, (err) => {
        forbiddenErr = err;
      });
      assert.ok(forbiddenErr instanceof AppError);
      assert.strictEqual(forbiddenErr.statusCode, 403);
      assert.strictEqual(forbiddenErr.message, 'You do not have permission to perform this action');

      // 3. PASSENGER role allowed
      const passengerReq: any = {
        user: { id: 'pass-u1', role: Role.PASSENGER },
      };
      let allowed = false;
      passengerAuthMiddleware(passengerReq, res, (err) => {
        if (!err) allowed = true;
      });
      assert.strictEqual(allowed, true);
    });
  });
});
