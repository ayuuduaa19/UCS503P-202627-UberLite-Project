import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Role, RideStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { rideService } from '../services/ride.service';
import { startRide, completeRide } from '../controllers/driver.controller';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/** Builds a minimal Ride object for use as a mock DB result */
const makeRide = (overrides: Partial<Record<string, any>> = {}) => ({
  id: 'ride-1',
  passengerId: 'passenger-1',
  driverId: 'driver-profile-1',
  pickupAddress: 'Point A',
  dropoffAddress: 'Point B',
  pickupLat: 28.62,
  pickupLng: 77.36,
  dropoffLat: 28.57,
  dropoffLng: 77.32,
  status: RideStatus.ACCEPTED,
  distanceKm: 10,
  durationMin: 20,
  createdAt: new Date(),
  updatedAt: new Date(),
  passenger: { id: 'passenger-1', name: 'Alice', phone: '+91111', email: 'alice@test.com' },
  driver: {
    id: 'driver-profile-1',
    vehicleType: 'STANDARD',
    vehicleModel: 'Swift',
    vehiclePlate: 'DL01AA0001',
    vehicleColor: 'White',
    rating: 4.8,
    user: { name: 'Dave Driver', phone: '+91222' },
  },
  ...overrides,
});

/** Builds a minimal Driver profile object */
const makeDriver = (overrides: Partial<Record<string, any>> = {}) => ({
  id: 'driver-profile-1',
  userId: 'driver-user-1',
  licenseNumber: 'LIC-001',
  vehicleModel: 'Swift',
  vehiclePlate: 'DL01AA0001',
  isAvailable: false,
  rating: 4.8,
  ...overrides,
});

// ---------------------------------------------------------------------------
// RideService – startRide (ACCEPTED → IN_PROGRESS)
// ---------------------------------------------------------------------------

describe('Ride Status Transitions – Task 15', () => {
  describe('RideService.startRide (ACCEPTED → IN_PROGRESS)', () => {
    it('should transition ride from ACCEPTED to IN_PROGRESS for the assigned driver', async () => {
      const originalDriverFindUnique = prisma.driver.findUnique;
      const originalRideFindUnique = prisma.ride.findUnique;
      const originalTransaction = prisma.$transaction;

      const mockDriver = makeDriver();
      const updatedRide = makeRide({ status: RideStatus.IN_PROGRESS });

      prisma.driver.findUnique = (async () => mockDriver) as any;
      prisma.ride.findUnique = (async () => makeRide({ status: RideStatus.ACCEPTED })) as any;
      (prisma.$transaction as any) = async (_ops: any[]) => [
        updatedRide,
        { id: mockDriver.id, isAvailable: false },
      ];

      try {
        const result = await rideService.startRide('ride-1', 'driver-user-1');

        assert.strictEqual(result.status, RideStatus.IN_PROGRESS);
        assert.strictEqual(result.id, 'ride-1');
      } finally {
        prisma.driver.findUnique = originalDriverFindUnique;
        prisma.ride.findUnique = originalRideFindUnique;
        prisma.$transaction = originalTransaction;
      }
    });

    it('should set driver isAvailable=false atomically when starting a ride', async () => {
      const originalDriverFindUnique = prisma.driver.findUnique;
      const originalRideFindUnique = prisma.ride.findUnique;
      const originalTransaction = prisma.$transaction;

      const mockDriver = makeDriver({ isAvailable: true }); // simulate driver somehow still available
      const updatedRide = makeRide({ status: RideStatus.IN_PROGRESS });

      let capturedOps: any[] | null = null;
      const originalRideUpdate = prisma.ride.update;
      const originalDriverUpdate = prisma.driver.update;

      prisma.driver.findUnique = (async () => mockDriver) as any;
      prisma.ride.findUnique = (async () => makeRide({ status: RideStatus.ACCEPTED })) as any;

      // Intercept $transaction to capture the operations passed to it
      (prisma.$transaction as any) = async (ops: any[]) => {
        capturedOps = ops;
        return [updatedRide, { id: mockDriver.id, isAvailable: false }];
      };

      // Intercept prisma.driver.update to inspect the data it would write
      let capturedDriverUpdateData: any = null;
      prisma.driver.update = (async (args: any) => {
        capturedDriverUpdateData = args.data;
        return { id: mockDriver.id, isAvailable: false };
      }) as any;

      // Intercept prisma.ride.update to inspect ride update data
      let capturedRideUpdateData: any = null;
      prisma.ride.update = (async (args: any) => {
        capturedRideUpdateData = args.data;
        return updatedRide;
      }) as any;

      try {
        const result = await rideService.startRide('ride-1', 'driver-user-1');

        assert.strictEqual(result.status, RideStatus.IN_PROGRESS);
        // The transaction was invoked (capturedOps will be set if $transaction called the interceptors)
        // Since we mock $transaction itself, we verify it was called with an array
        assert.ok(Array.isArray(capturedOps), 'Expected $transaction to be called with an array of operations');
      } finally {
        prisma.driver.findUnique = originalDriverFindUnique;
        prisma.ride.findUnique = originalRideFindUnique;
        prisma.$transaction = originalTransaction;
        prisma.ride.update = originalRideUpdate;
        prisma.driver.update = originalDriverUpdate;
      }
    });

    it('should throw 404 AppError when driver profile is not found', async () => {
      const originalDriverFindUnique = prisma.driver.findUnique;
      prisma.driver.findUnique = (async () => null) as any;

      try {
        await assert.rejects(
          async () => rideService.startRide('ride-1', 'unknown-user'),
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.strictEqual(err.statusCode, 404);
            assert.strictEqual(err.message, 'Driver profile not found');
            return true;
          }
        );
      } finally {
        prisma.driver.findUnique = originalDriverFindUnique;
      }
    });

    it('should throw 404 AppError when ride is not found', async () => {
      const originalDriverFindUnique = prisma.driver.findUnique;
      const originalRideFindUnique = prisma.ride.findUnique;

      prisma.driver.findUnique = (async () => makeDriver()) as any;
      prisma.ride.findUnique = (async () => null) as any;

      try {
        await assert.rejects(
          async () => rideService.startRide('no-such-ride', 'driver-user-1'),
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.strictEqual(err.statusCode, 404);
            assert.strictEqual(err.message, 'Ride not found');
            return true;
          }
        );
      } finally {
        prisma.driver.findUnique = originalDriverFindUnique;
        prisma.ride.findUnique = originalRideFindUnique;
      }
    });

    it('should throw 400 AppError when ride is not in ACCEPTED status', async () => {
      const originalDriverFindUnique = prisma.driver.findUnique;
      const originalRideFindUnique = prisma.ride.findUnique;

      prisma.driver.findUnique = (async () => makeDriver()) as any;

      const invalidStatuses: RideStatus[] = [
        RideStatus.REQUESTED,
        RideStatus.MATCHED,
        RideStatus.IN_PROGRESS,
        RideStatus.COMPLETED,
        RideStatus.CANCELLED,
      ];

      for (const status of invalidStatuses) {
        prisma.ride.findUnique = (async () => makeRide({ status })) as any;

        await assert.rejects(
          async () => rideService.startRide('ride-1', 'driver-user-1'),
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.strictEqual(err.statusCode, 400);
            assert.ok(
              err.message.includes('ACCEPTED'),
              `Expected error to mention ACCEPTED but got: ${err.message}`
            );
            return true;
          }
        );
      }

      prisma.driver.findUnique = originalDriverFindUnique;
      prisma.ride.findUnique = originalRideFindUnique;
    });

    it('should throw 403 AppError when a different driver tries to start the ride', async () => {
      const originalDriverFindUnique = prisma.driver.findUnique;
      const originalRideFindUnique = prisma.ride.findUnique;

      prisma.driver.findUnique = (async () =>
        makeDriver({ id: 'OTHER-driver-profile', userId: 'driver-user-2' })) as any;
      prisma.ride.findUnique = (async () =>
        makeRide({ status: RideStatus.ACCEPTED, driverId: 'driver-profile-1' })) as any;

      try {
        await assert.rejects(
          async () => rideService.startRide('ride-1', 'driver-user-2'),
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.strictEqual(err.statusCode, 403);
            assert.ok(err.message.toLowerCase().includes('forbidden'));
            return true;
          }
        );
      } finally {
        prisma.driver.findUnique = originalDriverFindUnique;
        prisma.ride.findUnique = originalRideFindUnique;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // RideService – completeRide (IN_PROGRESS → COMPLETED)
  // ---------------------------------------------------------------------------

  describe('RideService.completeRide (IN_PROGRESS → COMPLETED)', () => {
    it('should transition ride from IN_PROGRESS to COMPLETED and free up the driver', async () => {
      const originalDriverFindUnique = prisma.driver.findUnique;
      const originalRideFindUnique = prisma.ride.findUnique;
      const originalTransaction = prisma.$transaction;

      const mockDriver = makeDriver();
      const completedRide = makeRide({ status: RideStatus.COMPLETED });

      prisma.driver.findUnique = (async () => mockDriver) as any;
      prisma.ride.findUnique = (async () => makeRide({ status: RideStatus.IN_PROGRESS })) as any;
      (prisma.$transaction as any) = async (_ops: any[]) => [
        completedRide,
        { id: mockDriver.id, isAvailable: true },
      ];

      try {
        const result = await rideService.completeRide('ride-1', 'driver-user-1');

        assert.strictEqual(result.status, RideStatus.COMPLETED);
        assert.strictEqual(result.id, 'ride-1');
      } finally {
        prisma.driver.findUnique = originalDriverFindUnique;
        prisma.ride.findUnique = originalRideFindUnique;
        prisma.$transaction = originalTransaction;
      }
    });

    it('should throw 404 AppError when driver profile is not found', async () => {
      const originalDriverFindUnique = prisma.driver.findUnique;
      prisma.driver.findUnique = (async () => null) as any;

      try {
        await assert.rejects(
          async () => rideService.completeRide('ride-1', 'unknown-user'),
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.strictEqual(err.statusCode, 404);
            assert.strictEqual(err.message, 'Driver profile not found');
            return true;
          }
        );
      } finally {
        prisma.driver.findUnique = originalDriverFindUnique;
      }
    });

    it('should throw 404 AppError when ride is not found', async () => {
      const originalDriverFindUnique = prisma.driver.findUnique;
      const originalRideFindUnique = prisma.ride.findUnique;

      prisma.driver.findUnique = (async () => makeDriver()) as any;
      prisma.ride.findUnique = (async () => null) as any;

      try {
        await assert.rejects(
          async () => rideService.completeRide('no-such-ride', 'driver-user-1'),
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.strictEqual(err.statusCode, 404);
            assert.strictEqual(err.message, 'Ride not found');
            return true;
          }
        );
      } finally {
        prisma.driver.findUnique = originalDriverFindUnique;
        prisma.ride.findUnique = originalRideFindUnique;
      }
    });

    it('should throw 400 AppError when ride is not IN_PROGRESS', async () => {
      const originalDriverFindUnique = prisma.driver.findUnique;
      const originalRideFindUnique = prisma.ride.findUnique;

      prisma.driver.findUnique = (async () => makeDriver()) as any;

      const invalidStatuses: RideStatus[] = [
        RideStatus.REQUESTED,
        RideStatus.MATCHED,
        RideStatus.ACCEPTED,
        RideStatus.COMPLETED,
        RideStatus.CANCELLED,
      ];

      for (const status of invalidStatuses) {
        prisma.ride.findUnique = (async () => makeRide({ status })) as any;

        await assert.rejects(
          async () => rideService.completeRide('ride-1', 'driver-user-1'),
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.strictEqual(err.statusCode, 400);
            assert.ok(
              err.message.includes('IN_PROGRESS'),
              `Expected error to mention IN_PROGRESS but got: ${err.message}`
            );
            return true;
          }
        );
      }

      prisma.driver.findUnique = originalDriverFindUnique;
      prisma.ride.findUnique = originalRideFindUnique;
    });

    it('should throw 403 AppError when a different driver tries to complete the ride', async () => {
      const originalDriverFindUnique = prisma.driver.findUnique;
      const originalRideFindUnique = prisma.ride.findUnique;

      prisma.driver.findUnique = (async () =>
        makeDriver({ id: 'OTHER-driver-profile', userId: 'driver-user-2' })) as any;
      prisma.ride.findUnique = (async () =>
        makeRide({ status: RideStatus.IN_PROGRESS, driverId: 'driver-profile-1' })) as any;

      try {
        await assert.rejects(
          async () => rideService.completeRide('ride-1', 'driver-user-2'),
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.strictEqual(err.statusCode, 403);
            assert.ok(err.message.toLowerCase().includes('forbidden'));
            return true;
          }
        );
      } finally {
        prisma.driver.findUnique = originalDriverFindUnique;
        prisma.ride.findUnique = originalRideFindUnique;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Controller – startRide & completeRide HTTP handlers
  // ---------------------------------------------------------------------------

  describe('Driver Controller – startRide & completeRide HTTP handlers', () => {
    it('startRide controller should return 200 with updated ride on success', async () => {
      const originalDriverFindUnique = prisma.driver.findUnique;
      const originalRideFindUnique = prisma.ride.findUnique;
      const originalTransaction = prisma.$transaction;

      const updatedRide = makeRide({ status: RideStatus.IN_PROGRESS });

      prisma.driver.findUnique = (async () => makeDriver()) as any;
      prisma.ride.findUnique = (async () => makeRide({ status: RideStatus.ACCEPTED })) as any;
      (prisma.$transaction as any) = async (_ops: any[]) => [
        updatedRide,
        { id: 'driver-profile-1', isAvailable: false },
      ];

      try {
        const req: any = {
          user: { id: 'driver-user-1', role: Role.DRIVER },
          params: { id: 'ride-1' },
        };
        const res = createMockResponse();

        await startRide(req, res, (err: any) => {
          if (err) throw err;
        });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.message, 'Ride started successfully');
        assert.strictEqual(res.body.data.ride.status, RideStatus.IN_PROGRESS);
      } finally {
        prisma.driver.findUnique = originalDriverFindUnique;
        prisma.ride.findUnique = originalRideFindUnique;
        prisma.$transaction = originalTransaction;
      }
    });

    it('startRide controller should forward AppError to next when status is invalid', async () => {
      const originalDriverFindUnique = prisma.driver.findUnique;
      const originalRideFindUnique = prisma.ride.findUnique;

      prisma.driver.findUnique = (async () => makeDriver()) as any;
      prisma.ride.findUnique = (async () =>
        makeRide({ status: RideStatus.REQUESTED })) as any;

      try {
        const req: any = {
          user: { id: 'driver-user-1', role: Role.DRIVER },
          params: { id: 'ride-1' },
        };
        const res = createMockResponse();
        let capturedError: any = null;

        await startRide(req, res, (err: any) => {
          capturedError = err;
        });

        assert.ok(capturedError instanceof AppError);
        assert.strictEqual(capturedError.statusCode, 400);
      } finally {
        prisma.driver.findUnique = originalDriverFindUnique;
        prisma.ride.findUnique = originalRideFindUnique;
      }
    });

    it('completeRide controller should return 200 with updated ride on success', async () => {
      const originalDriverFindUnique = prisma.driver.findUnique;
      const originalRideFindUnique = prisma.ride.findUnique;
      const originalTransaction = prisma.$transaction;

      const completedRide = makeRide({ status: RideStatus.COMPLETED });

      prisma.driver.findUnique = (async () => makeDriver()) as any;
      prisma.ride.findUnique = (async () => makeRide({ status: RideStatus.IN_PROGRESS })) as any;
      (prisma.$transaction as any) = async (_ops: any[]) => [
        completedRide,
        { id: 'driver-profile-1', isAvailable: true },
      ];

      try {
        const req: any = {
          user: { id: 'driver-user-1', role: Role.DRIVER },
          params: { id: 'ride-1' },
        };
        const res = createMockResponse();

        await completeRide(req, res, (err: any) => {
          if (err) throw err;
        });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.message, 'Ride completed successfully');
        assert.strictEqual(res.body.data.ride.status, RideStatus.COMPLETED);
      } finally {
        prisma.driver.findUnique = originalDriverFindUnique;
        prisma.ride.findUnique = originalRideFindUnique;
        prisma.$transaction = originalTransaction;
      }
    });

    it('completeRide controller should forward AppError to next when status is invalid', async () => {
      const originalDriverFindUnique = prisma.driver.findUnique;
      const originalRideFindUnique = prisma.ride.findUnique;

      prisma.driver.findUnique = (async () => makeDriver()) as any;
      prisma.ride.findUnique = (async () =>
        makeRide({ status: RideStatus.ACCEPTED })) as any;

      try {
        const req: any = {
          user: { id: 'driver-user-1', role: Role.DRIVER },
          params: { id: 'ride-1' },
        };
        const res = createMockResponse();
        let capturedError: any = null;

        await completeRide(req, res, (err: any) => {
          capturedError = err;
        });

        assert.ok(capturedError instanceof AppError);
        assert.strictEqual(capturedError.statusCode, 400);
      } finally {
        prisma.driver.findUnique = originalDriverFindUnique;
        prisma.ride.findUnique = originalRideFindUnique;
      }
    });

    it('startRide controller should forward 403 AppError when wrong driver calls it', async () => {
      const originalDriverFindUnique = prisma.driver.findUnique;
      const originalRideFindUnique = prisma.ride.findUnique;

      prisma.driver.findUnique = (async () =>
        makeDriver({ id: 'OTHER-driver', userId: 'driver-user-2' })) as any;
      prisma.ride.findUnique = (async () =>
        makeRide({ status: RideStatus.ACCEPTED, driverId: 'driver-profile-1' })) as any;

      try {
        const req: any = {
          user: { id: 'driver-user-2', role: Role.DRIVER },
          params: { id: 'ride-1' },
        };
        const res = createMockResponse();
        let capturedError: any = null;

        await startRide(req, res, (err: any) => {
          capturedError = err;
        });

        assert.ok(capturedError instanceof AppError);
        assert.strictEqual(capturedError.statusCode, 403);
      } finally {
        prisma.driver.findUnique = originalDriverFindUnique;
        prisma.ride.findUnique = originalRideFindUnique;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Invalid transition guard – full state machine coverage (parametric)
  // ---------------------------------------------------------------------------

  describe('Invalid transition guard – all non-ACCEPTED states reject startRide', () => {
    const nonAcceptedStatuses: RideStatus[] = [
      RideStatus.REQUESTED,
      RideStatus.MATCHED,
      RideStatus.IN_PROGRESS,
      RideStatus.COMPLETED,
      RideStatus.CANCELLED,
    ];

    for (const status of nonAcceptedStatuses) {
      it(`startRide should reject ride with status=${status}`, async () => {
        const originalDriverFindUnique = prisma.driver.findUnique;
        const originalRideFindUnique = prisma.ride.findUnique;

        prisma.driver.findUnique = (async () => makeDriver()) as any;
        prisma.ride.findUnique = (async () => makeRide({ status })) as any;

        try {
          await assert.rejects(
            async () => rideService.startRide('ride-1', 'driver-user-1'),
            (err: any) => {
              assert.ok(err instanceof AppError);
              assert.strictEqual(err.statusCode, 400);
              return true;
            }
          );
        } finally {
          prisma.driver.findUnique = originalDriverFindUnique;
          prisma.ride.findUnique = originalRideFindUnique;
        }
      });
    }
  });

  describe('Invalid transition guard – all non-IN_PROGRESS states reject completeRide', () => {
    const nonInProgressStatuses: RideStatus[] = [
      RideStatus.REQUESTED,
      RideStatus.MATCHED,
      RideStatus.ACCEPTED,
      RideStatus.COMPLETED,
      RideStatus.CANCELLED,
    ];

    for (const status of nonInProgressStatuses) {
      it(`completeRide should reject ride with status=${status}`, async () => {
        const originalDriverFindUnique = prisma.driver.findUnique;
        const originalRideFindUnique = prisma.ride.findUnique;

        prisma.driver.findUnique = (async () => makeDriver()) as any;
        prisma.ride.findUnique = (async () => makeRide({ status })) as any;

        try {
          await assert.rejects(
            async () => rideService.completeRide('ride-1', 'driver-user-1'),
            (err: any) => {
              assert.ok(err instanceof AppError);
              assert.strictEqual(err.statusCode, 400);
              return true;
            }
          );
        } finally {
          prisma.driver.findUnique = originalDriverFindUnique;
          prisma.ride.findUnique = originalRideFindUnique;
        }
      });
    }
  });
});
