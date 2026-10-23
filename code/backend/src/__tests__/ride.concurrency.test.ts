import { describe, it } from 'node:test';
import assert from 'node:assert';
import { RideStatus, VehicleType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { concurrencyCoordinator } from '../utils/concurrency';
import { rideService } from '../services/ride.service';
import { matchingService } from '../services/matching.service';
import { getActiveRide as getPassengerActiveRide } from '../controllers/passenger.controller';
import { getActiveRide as getDriverActiveRide } from '../controllers/driver.controller';

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

describe('Task 40: Ride Concurrency & Active-Ride Coordination', () => {
  describe('ConcurrencyCoordinator Mutex Locking', () => {
    it('should serialize concurrent operations on the same key', async () => {
      const order: number[] = [];

      const p1 = concurrencyCoordinator.withLock('test:res1', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        order.push(1);
        return 1;
      });

      const p2 = concurrencyCoordinator.withLock('test:res1', async () => {
        order.push(2);
        return 2;
      });

      const results = await Promise.all([p1, p2]);
      assert.deepStrictEqual(results, [1, 2]);
      assert.deepStrictEqual(order, [1, 2]); // Must execute in order because of lock
    });

    it('should allow concurrent operations on different keys to proceed independently', async () => {
      let key1Finished = false;

      const p1 = concurrencyCoordinator.withLock('test:keyA', async () => {
        await new Promise((resolve) => setTimeout(resolve, 80));
        key1Finished = true;
      });

      const p2 = concurrencyCoordinator.withLock('test:keyB', async () => {
        // Should complete before p1 finishes
        return !key1Finished;
      });

      const [, key2RanBeforeKey1] = await Promise.all([p1, p2]);
      assert.strictEqual(key2RanBeforeKey1, true);
    });
  });

  describe('Passenger Active-Ride Coordination & Concurrent Request Guard', () => {
    it('should reject creating a ride if passenger already has an active ride in progress (409 Conflict)', async () => {
      const originalFindMany = prisma.ride.findMany;

      // Mock passenger having an active ride in REQUESTED status
      prisma.ride.findMany = (async () => [
        {
          id: 'existing-active-ride',
          passengerId: 'p-busy-1',
          status: RideStatus.REQUESTED,
          createdAt: new Date(),
        },
      ]) as any;

      try {
        await assert.rejects(
          async () => {
            await rideService.createRide('p-busy-1', {
              pickupAddress: 'Location A',
              dropoffAddress: 'Location B',
              pickupLat: 28.6,
              pickupLng: 77.2,
              dropoffLat: 28.7,
              dropoffLng: 77.3,
            });
          },
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.strictEqual(err.statusCode, 409);
            assert.strictEqual(err.message, 'Passenger already has an active ride in progress');
            return true;
          }
        );
      } finally {
        prisma.ride.findMany = originalFindMany;
      }
    });

    it('should allow creating a new ride once the previous ride is COMPLETED or CANCELLED', async () => {
      const originalFindMany = prisma.ride.findMany;
      const originalCreate = prisma.ride.create;

      // Passenger's previous ride was completed
      prisma.ride.findMany = (async () => [
        {
          id: 'prev-completed-ride',
          passengerId: 'p-free-1',
          status: RideStatus.COMPLETED,
          createdAt: new Date(),
        },
      ]) as any;

      prisma.ride.create = (async ({ data }: any) => ({
        id: 'new-ride-id',
        passengerId: data.passengerId,
        status: RideStatus.REQUESTED,
        pickupAddress: data.pickupAddress,
        dropoffAddress: data.dropoffAddress,
        createdAt: new Date(),
      })) as any;

      try {
        const ride = await rideService.createRide('p-free-1', {
          pickupAddress: 'Point A',
          dropoffAddress: 'Point B',
          pickupLat: 28.6,
          pickupLng: 77.2,
          dropoffLat: 28.7,
          dropoffLng: 77.3,
        });

        assert.strictEqual(ride.id, 'new-ride-id');
        assert.strictEqual(ride.status, RideStatus.REQUESTED);
      } finally {
        prisma.ride.findMany = originalFindMany;
        prisma.ride.create = originalCreate;
      }
    });
  });

  describe('Driver Active-Ride Coordination', () => {
    it('should reject acceptRide when driver already has another active ride in progress (409 Conflict)', async () => {
      const originalDriverFind = prisma.driver.findUnique;
      const originalRideFindMany = prisma.ride.findMany;

      prisma.driver.findUnique = (async () => ({
        id: 'driver-busy-id',
        userId: 'driver-user-busy',
        isAvailable: false,
      })) as any;

      // Driver already has an IN_PROGRESS ride
      prisma.ride.findMany = (async () => [
        {
          id: 'ride-existing-in-progress',
          driverId: 'driver-busy-id',
          status: RideStatus.IN_PROGRESS,
        },
      ]) as any;

      try {
        await assert.rejects(
          async () => {
            await rideService.acceptRide('ride-new-to-accept', 'driver-user-busy');
          },
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.strictEqual(err.statusCode, 409);
            assert.strictEqual(err.message, 'Driver already has an active ride in progress');
            return true;
          }
        );
      } finally {
        prisma.driver.findUnique = originalDriverFind;
        prisma.ride.findMany = originalRideFindMany;
      }
    });
  });

  describe('Concurrent Driver Matching with Candidate Fallback', () => {
    it('should automatically fall back to the next nearest candidate driver if the first driver is claimed concurrently', async () => {
      const originalRideFind = prisma.ride.findUnique;
      const originalDriverFindMany = prisma.driver.findMany;
      const originalDriverFindUnique = prisma.driver.findUnique;
      const originalDriverUpdateMany = prisma.driver.updateMany;
      const originalRideUpdate = prisma.ride.update;
      const originalTx = prisma.$transaction;

      // Ride needing a driver
      prisma.ride.findUnique = (async () => ({
        id: 'ride-fallback-test',
        passengerId: 'p-1',
        status: RideStatus.REQUESTED,
        pickupLat: 28.6139,
        pickupLng: 77.209,
      })) as any;

      // Two nearby drivers found
      prisma.driver.findMany = (async () => [
        {
          id: 'driver-1-closest',
          userId: 'u-d1',
          licenseNumber: 'LIC-D1',
          vehicleType: VehicleType.STANDARD,
          vehicleModel: 'Swift',
          vehiclePlate: 'DL-01-A1',
          vehicleColor: 'White',
          rating: 4.9,
          currentLat: 28.6145,
          currentLng: 77.2091, // closest
          isAvailable: true,
          user: { name: 'Driver 1' },
        },
        {
          id: 'driver-2-second',
          userId: 'u-d2',
          licenseNumber: 'LIC-D2',
          vehicleType: VehicleType.STANDARD,
          vehicleModel: 'Etios',
          vehiclePlate: 'DL-01-B2',
          vehicleColor: 'Silver',
          rating: 4.8,
          currentLat: 28.618,
          currentLng: 77.212, // 2nd closest
          isAvailable: true,
          user: { name: 'Driver 2' },
        },
      ]) as any;

      // Driver 1 became unavailable concurrently (isAvailable: false or count: 0)
      let updateAttempt = 0;
      prisma.driver.findUnique = (async ({ where }: any) => {
        if (where.id === 'driver-1-closest') {
          // Driver 1 was claimed just before commit
          return { id: 'driver-1-closest', isAvailable: false };
        }
        return { id: 'driver-2-second', isAvailable: true };
      }) as any;

      prisma.driver.updateMany = (async ({ where }: any) => {
        updateAttempt++;
        if (where.id === 'driver-1-closest') {
          return { count: 0 };
        }
        return { count: 1 };
      }) as any;

      prisma.ride.update = (async ({ data }: any) => ({
        id: 'ride-fallback-test',
        driverId: data.driverId,
        status: data.status,
        matchedAt: data.matchedAt,
      })) as any;

      prisma.$transaction = (async (cb: any) => cb(prisma)) as any;

      try {
        const result = await matchingService.matchDriverForRide('ride-fallback-test', {}, 'p-1');

        // Should have smoothly fallen back to driver 2!
        assert.ok(result);
        assert.strictEqual(result.matchedDriver.driverId, 'driver-2-second');
        assert.strictEqual(result.ride.driverId, 'driver-2-second');
        assert.strictEqual(result.ride.status, RideStatus.MATCHED);
      } finally {
        prisma.ride.findUnique = originalRideFind;
        prisma.driver.findMany = originalDriverFindMany;
        prisma.driver.findUnique = originalDriverFindUnique;
        prisma.driver.updateMany = originalDriverUpdateMany;
        prisma.ride.update = originalRideUpdate;
        prisma.$transaction = originalTx;
      }
    });
  });

  describe('Active Ride Endpoints', () => {
    it('GET /api/passenger/rides/active should return active ride when present', async () => {
      const originalFindMany = prisma.ride.findMany;

      prisma.ride.findMany = (async () => [
        {
          id: 'active-passenger-ride',
          passengerId: 'p-test-active',
          status: RideStatus.MATCHED,
          pickupAddress: 'Start Place',
          dropoffAddress: 'End Place',
          createdAt: new Date(),
        },
      ]) as any;

      const req: any = { user: { id: 'p-test-active', role: 'PASSENGER' } };
      const res = createMockResponse();

      try {
        await getPassengerActiveRide(req, res, () => {});

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.ride.id, 'active-passenger-ride');
        assert.strictEqual(res.body.data.ride.status, RideStatus.MATCHED);
      } finally {
        prisma.ride.findMany = originalFindMany;
      }
    });

    it('GET /api/driver/rides/active should return active ride for driver', async () => {
      const originalDriverFind = prisma.driver.findUnique;
      const originalRideFindMany = prisma.ride.findMany;

      prisma.driver.findUnique = (async () => ({
        id: 'drv-active-id',
        userId: 'usr-drv-active',
      })) as any;

      prisma.ride.findMany = (async () => [
        {
          id: 'active-driver-ride',
          driverId: 'drv-active-id',
          status: RideStatus.ACCEPTED,
          createdAt: new Date(),
        },
      ]) as any;

      const req: any = { user: { id: 'usr-drv-active', role: 'DRIVER' } };
      const res = createMockResponse();

      try {
        await getDriverActiveRide(req, res, () => {});

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.ride.id, 'active-driver-ride');
        assert.strictEqual(res.body.data.ride.status, RideStatus.ACCEPTED);
      } finally {
        prisma.driver.findUnique = originalDriverFind;
        prisma.ride.findMany = originalRideFindMany;
      }
    });
  });
});
