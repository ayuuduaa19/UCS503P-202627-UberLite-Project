import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PaymentStatus, RideStatus, VehicleType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { fareService, FARE_RULES, FareBreakdown } from '../services/fare.service';
import {
  estimateRideFare,
  estimateFare,
  getNearbyDrivers,
} from '../controllers/passenger.controller';
import { completeRide } from '../controllers/driver.controller';

// ─── Helper ───────────────────────────────────────────────────────────────────

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

// Connaught Place → Cyber City approx 28.5 km straight-line
const PICKUP  = { lat: 28.6315, lng: 77.2167 };
const DROPOFF = { lat: 28.4952, lng: 77.0895 };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Fare Estimation & Final Fare Calculation', () => {

  // ─── #17: Fare rules and breakdown ──────────────────────────────────────

  describe('FARE_RULES configuration', () => {
    it('should define fare rules for all three vehicle types', () => {
      assert.ok(FARE_RULES[VehicleType.STANDARD]);
      assert.ok(FARE_RULES[VehicleType.PREMIUM]);
      assert.ok(FARE_RULES[VehicleType.XL]);
    });

    it('each vehicle type should have positive baseFare and ratePerKm', () => {
      for (const [, rule] of Object.entries(FARE_RULES)) {
        assert.ok(rule.baseFare > 0, 'baseFare must be positive');
        assert.ok(rule.ratePerKm > 0, 'ratePerKm must be positive');
      }
    });

    it('PREMIUM should have higher rates than STANDARD', () => {
      assert.ok(FARE_RULES[VehicleType.PREMIUM].baseFare > FARE_RULES[VehicleType.STANDARD].baseFare);
      assert.ok(FARE_RULES[VehicleType.PREMIUM].ratePerKm > FARE_RULES[VehicleType.STANDARD].ratePerKm);
    });
  });

  // ─── calculateFareBreakdown unit tests ───────────────────────────────────

  describe('FareService.calculateFareBreakdown', () => {
    it('should apply formula: totalFare = baseFare + (distanceKm × ratePerKm)', () => {
      const distanceKm = 10;
      const result = fareService.calculateFareBreakdown(distanceKm, VehicleType.STANDARD);

      const { baseFare, ratePerKm } = FARE_RULES[VehicleType.STANDARD];
      const expectedDistanceFare = parseFloat((distanceKm * ratePerKm).toFixed(2));
      const expectedTotal = parseFloat((baseFare + expectedDistanceFare).toFixed(2));

      assert.strictEqual(result.baseFare, baseFare);
      assert.strictEqual(result.distanceFare, expectedDistanceFare);
      assert.strictEqual(result.totalFare, expectedTotal);
      assert.strictEqual(result.timeFare, 0);
      assert.strictEqual(result.surgeMultiplier, 1.0);
      assert.strictEqual(result.currency, 'INR');
      assert.strictEqual(result.vehicleType, VehicleType.STANDARD);
    });

    it('should compute correct fare for PREMIUM vehicle over 20 km', () => {
      const distanceKm = 20;
      const result = fareService.calculateFareBreakdown(distanceKm, VehicleType.PREMIUM);

      const { baseFare, ratePerKm } = FARE_RULES[VehicleType.PREMIUM];
      const expectedTotal = parseFloat((baseFare + distanceKm * ratePerKm).toFixed(2));
      assert.strictEqual(result.totalFare, expectedTotal);
    });

    it('should compute correct fare for XL vehicle over 5 km', () => {
      const distanceKm = 5;
      const result = fareService.calculateFareBreakdown(distanceKm, VehicleType.XL);

      const { baseFare, ratePerKm } = FARE_RULES[VehicleType.XL];
      const expectedTotal = parseFloat((baseFare + distanceKm * ratePerKm).toFixed(2));
      assert.strictEqual(result.totalFare, expectedTotal);
    });

    it('should return zero distanceFare when distanceKm is 0', () => {
      const result = fareService.calculateFareBreakdown(0, VehicleType.STANDARD);
      assert.strictEqual(result.distanceFare, 0);
      assert.strictEqual(result.totalFare, FARE_RULES[VehicleType.STANDARD].baseFare);
    });

    it('should throw 400 AppError for negative distance', () => {
      assert.throws(
        () => fareService.calculateFareBreakdown(-1, VehicleType.STANDARD),
        (err: any) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.statusCode, 400);
          return true;
        }
      );
    });

    it('should default to STANDARD vehicle type when none provided', () => {
      const withStandard = fareService.calculateFareBreakdown(10, VehicleType.STANDARD);
      const withDefault  = fareService.calculateFareBreakdown(10);
      assert.strictEqual(withDefault.totalFare, withStandard.totalFare);
      assert.strictEqual(withDefault.vehicleType, VehicleType.STANDARD);
    });
  });

  // ─── #17: estimateFareForRide ─────────────────────────────────────────────

  describe('FareService.estimateFareForRide', () => {
    it('should estimate fare using stored distanceKm when available', async () => {
      const originalFindUnique = prisma.ride.findUnique;

      prisma.ride.findUnique = (async () => ({
        id: 'ride-est-1',
        pickupLat:  PICKUP.lat,
        pickupLng:  PICKUP.lng,
        dropoffLat: DROPOFF.lat,
        dropoffLng: DROPOFF.lng,
        distanceKm: 15.0,
        driver: { vehicleType: VehicleType.STANDARD },
      })) as any;

      try {
        const result = await fareService.estimateFareForRide('ride-est-1');

        assert.strictEqual(result.rideId, 'ride-est-1');
        assert.strictEqual(result.distanceKm, 15);
        assert.strictEqual(result.vehicleType, VehicleType.STANDARD);

        const { baseFare, ratePerKm } = FARE_RULES[VehicleType.STANDARD];
        const expected = parseFloat((baseFare + 15 * ratePerKm).toFixed(2));
        assert.strictEqual(result.totalFare, expected);
        assert.ok(result.totalFare > 0);
      } finally {
        prisma.ride.findUnique = originalFindUnique;
      }
    });

    it('should estimate fare from coordinates when distanceKm is null', async () => {
      const originalFindUnique = prisma.ride.findUnique;

      prisma.ride.findUnique = (async () => ({
        id: 'ride-est-2',
        pickupLat:  PICKUP.lat,
        pickupLng:  PICKUP.lng,
        dropoffLat: DROPOFF.lat,
        dropoffLng: DROPOFF.lng,
        distanceKm: null,
        driver: null,
      })) as any;

      try {
        const result = await fareService.estimateFareForRide('ride-est-2');

        assert.ok(result.distanceKm > 0, 'distance should be computed from coordinates');
        assert.ok(result.totalFare > 0, 'total fare should be positive');
        assert.strictEqual(result.vehicleType, VehicleType.STANDARD);
      } finally {
        prisma.ride.findUnique = originalFindUnique;
      }
    });

    it('should throw 404 when ride does not exist', async () => {
      const originalFindUnique = prisma.ride.findUnique;
      prisma.ride.findUnique = (async () => null) as any;

      try {
        await assert.rejects(
          async () => fareService.estimateFareForRide('nonexistent-ride'),
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

    it('should use PREMIUM rates when ride driver has PREMIUM vehicle', async () => {
      const originalFindUnique = prisma.ride.findUnique;

      prisma.ride.findUnique = (async () => ({
        id: 'ride-est-3',
        pickupLat:  PICKUP.lat,
        pickupLng:  PICKUP.lng,
        dropoffLat: DROPOFF.lat,
        dropoffLng: DROPOFF.lng,
        distanceKm: 10.0,
        driver: { vehicleType: VehicleType.PREMIUM },
      })) as any;

      try {
        const result = await fareService.estimateFareForRide('ride-est-3');
        const { baseFare, ratePerKm } = FARE_RULES[VehicleType.PREMIUM];
        const expected = parseFloat((baseFare + 10 * ratePerKm).toFixed(2));
        assert.strictEqual(result.totalFare, expected);
      } finally {
        prisma.ride.findUnique = originalFindUnique;
      }
    });
  });

  // ─── #17: estimateRideFare controller ────────────────────────────────────

  describe('Controller - estimateRideFare (GET /api/passenger/rides/:id/fare/estimate)', () => {
    it('should return 200 with fare estimate breakdown', async () => {
      const originalFindUnique = prisma.ride.findUnique;

      prisma.ride.findUnique = (async () => ({
        id: 'ride-ctrl-est-1',
        pickupLat:  PICKUP.lat,
        pickupLng:  PICKUP.lng,
        dropoffLat: DROPOFF.lat,
        dropoffLng: DROPOFF.lng,
        distanceKm: 20.0,
        driver: { vehicleType: VehicleType.STANDARD },
      })) as any;

      try {
        const req: any = {
          user: { id: 'pass-user-1' },
          params: { id: 'ride-ctrl-est-1' },
        };
        const res = createMockResponse();

        await estimateRideFare(req, res, (err: any) => { if (err) throw err; });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.ok(res.body.data.fareEstimate);
        assert.ok(res.body.data.fareEstimate.totalFare > 0);
        assert.strictEqual(res.body.data.fareEstimate.rideId, 'ride-ctrl-est-1');
        assert.strictEqual(res.body.data.fareEstimate.currency, 'INR');
      } finally {
        prisma.ride.findUnique = originalFindUnique;
      }
    });

    it('should forward 404 error when ride does not exist', async () => {
      const originalFindUnique = prisma.ride.findUnique;
      prisma.ride.findUnique = (async () => null) as any;

      try {
        const req: any = { user: { id: 'pass-1' }, params: { id: 'bad-id' } };
        const res = createMockResponse();
        let capturedErr: any = null;

        await estimateRideFare(req, res, (err: any) => { capturedErr = err; });

        assert.ok(capturedErr instanceof AppError);
        assert.strictEqual(capturedErr.statusCode, 404);
      } finally {
        prisma.ride.findUnique = originalFindUnique;
      }
    });
  });

  // ─── #17: estimateFareFromLocations ──────────────────────────────────────

  describe('FareService.estimateFareFromLocations', () => {
    it('should calculate estimated fare directly from pickup and dropoff coordinates', () => {
      const estimate = fareService.estimateFareFromLocations(PICKUP, DROPOFF, VehicleType.STANDARD);

      assert.ok(estimate.distanceKm > 0);
      assert.strictEqual(estimate.currency, 'INR');
      assert.strictEqual(estimate.vehicleType, VehicleType.STANDARD);

      const { baseFare, ratePerKm } = FARE_RULES[VehicleType.STANDARD];
      const expectedTotal = parseFloat((baseFare + estimate.distanceKm * ratePerKm).toFixed(2));
      assert.strictEqual(estimate.totalFare, expectedTotal);
      assert.deepStrictEqual(estimate.pickup, PICKUP);
      assert.deepStrictEqual(estimate.dropoff, DROPOFF);
    });

    it('should calculate different fares for different vehicle types from same locations', () => {
      const standard = fareService.estimateFareFromLocations(PICKUP, DROPOFF, VehicleType.STANDARD);
      const premium  = fareService.estimateFareFromLocations(PICKUP, DROPOFF, VehicleType.PREMIUM);
      const xl       = fareService.estimateFareFromLocations(PICKUP, DROPOFF, VehicleType.XL);

      assert.strictEqual(standard.distanceKm, premium.distanceKm);
      assert.strictEqual(standard.distanceKm, xl.distanceKm);
      assert.ok(premium.totalFare > standard.totalFare, 'PREMIUM should cost more than STANDARD');
      assert.ok(xl.totalFare > standard.totalFare, 'XL should cost more than STANDARD');
    });
  });

  // ─── #17: estimateFare controller (POST /api/passenger/fare/estimate) ────

  describe('Controller - estimateFare (POST /api/passenger/fare/estimate)', () => {
    it('should return 200 with fare estimate for flat coordinates', async () => {
      const req: any = {
        user: { id: 'pass-user-1' },
        body: {
          pickupLat: PICKUP.lat,
          pickupLng: PICKUP.lng,
          dropoffLat: DROPOFF.lat,
          dropoffLng: DROPOFF.lng,
          vehicleType: VehicleType.STANDARD,
        },
      };
      const res = createMockResponse();

      await estimateFare(req, res, (err: any) => { if (err) throw err; });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.message, 'Fare estimated successfully');
      assert.ok(res.body.data.fareEstimate);
      assert.ok(res.body.data.fareEstimate.totalFare > 0);
      assert.strictEqual(res.body.data.fareEstimate.currency, 'INR');
    });

    it('should return 200 with fare estimate for nested coordinate objects', async () => {
      const req: any = {
        user: { id: 'pass-user-1' },
        body: {
          pickup: PICKUP,
          dropoff: DROPOFF,
          vehicleType: VehicleType.PREMIUM,
        },
      };
      const res = createMockResponse();

      await estimateFare(req, res, (err: any) => { if (err) throw err; });

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.fareEstimate.vehicleType, VehicleType.PREMIUM);
    });

    it('should forward validation error when coordinates are missing', async () => {
      const req: any = {
        user: { id: 'pass-user-1' },
        body: {
          pickupLat: PICKUP.lat,
          // missing pickupLng and dropoff
        },
      };
      const res = createMockResponse();
      let capturedErr: any = null;

      await estimateFare(req, res, (err: any) => { capturedErr = err; });

      assert.ok(capturedErr, 'should fail validation');
    });
  });

  // ─── #18: completeFare (final fare on ride completion) ───────────────────

  describe('FareService.completeFare', () => {
    const makeRide = (overrides: any = {}) => ({
      id: 'ride-complete-1',
      status: RideStatus.IN_PROGRESS,
      pickupLat:  PICKUP.lat,
      pickupLng:  PICKUP.lng,
      dropoffLat: DROPOFF.lat,
      dropoffLng: DROPOFF.lng,
      distanceKm: 18.5,
      driver: {
        id:          'driver-uuid-1',
        vehicleType: VehicleType.STANDARD,
        user: { id: 'driver-user-uuid-1' },
      },
      ...overrides,
    });

    it('should create a Fare record and mark ride COMPLETED atomically', async () => {
      const originalRideFindUnique  = prisma.ride.findUnique;
      const originalFareFindUnique  = prisma.fare.findUnique;
      const originalTransaction     = prisma.$transaction;

      let createdFare: any  = null;
      let updatedRide: any  = null;

      prisma.ride.findUnique = (async (args: any) => {
        if (args.where.id === 'ride-complete-1') return makeRide();
        return null;
      }) as any;

      prisma.fare.findUnique = (async () => null) as any;

      // Simulate transaction by running callback with a fake tx
      (prisma as any).$transaction = (async (fn: any) => {
        const tx = {
          fare: {
            create: async (args: any) => {
              createdFare = args.data;
              return { id: 'fare-uuid-1', ...args.data };
            },
          },
          ride: {
            update: async (args: any) => {
              updatedRide = args.data;
              return {
                id: 'ride-complete-1',
                status: RideStatus.COMPLETED,
                ...args.data,
                passenger: { id: 'pass-1', name: 'Alice', phone: null, email: 'a@b.com' },
                driver: { id: 'driver-uuid-1', vehicleType: VehicleType.STANDARD, vehicleModel: 'Swift', vehiclePlate: 'DL01AB1234', rating: 4.8 },
                fare: null,
              };
            },
          },
        };
        return fn(tx);
      }) as any;

      try {
        const result = await fareService.completeFare('ride-complete-1', 'driver-user-uuid-1');

        // Fare persisted with correct values
        assert.ok(createdFare, 'fare.create should have been called');
        assert.strictEqual(createdFare.rideId, 'ride-complete-1');
        assert.ok(createdFare.baseFare > 0);
        assert.ok(createdFare.distanceFare > 0);
        assert.strictEqual(createdFare.timeFare, 0);
        assert.strictEqual(createdFare.surgeMultiplier, 1.0);
        assert.ok(createdFare.totalFare > 0);
        assert.strictEqual(createdFare.currency, 'INR');
        assert.strictEqual(createdFare.paymentStatus, PaymentStatus.PENDING);

        // Ride updated to COMPLETED
        assert.ok(updatedRide, 'ride.update should have been called');
        assert.strictEqual(updatedRide.status, RideStatus.COMPLETED);

        // Result structure
        assert.ok(result.ride);
        assert.ok(result.fare);

        // Validate formula: baseFare + (18.5 × ratePerKm)
        const { baseFare, ratePerKm } = FARE_RULES[VehicleType.STANDARD];
        const expectedTotal = parseFloat((baseFare + 18.5 * ratePerKm).toFixed(2));
        assert.strictEqual(createdFare.totalFare, expectedTotal);
      } finally {
        prisma.ride.findUnique  = originalRideFindUnique;
        prisma.fare.findUnique  = originalFareFindUnique;
        (prisma as any).$transaction = originalTransaction;
      }
    });

    it('should throw 404 when ride does not exist', async () => {
      const originalFindUnique = prisma.ride.findUnique;
      prisma.ride.findUnique = (async () => null) as any;

      try {
        await assert.rejects(
          async () => fareService.completeFare('bad-ride', 'any-driver'),
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.strictEqual(err.statusCode, 404);
            return true;
          }
        );
      } finally {
        prisma.ride.findUnique = originalFindUnique;
      }
    });

    it('should throw 400 when no driver is assigned', async () => {
      const originalFindUnique = prisma.ride.findUnique;
      prisma.ride.findUnique = (async () => makeRide({ driver: null })) as any;

      try {
        await assert.rejects(
          async () => fareService.completeFare('ride-complete-1', 'any-driver'),
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.strictEqual(err.statusCode, 400);
            return true;
          }
        );
      } finally {
        prisma.ride.findUnique = originalFindUnique;
      }
    });

    it('should throw 403 when a different driver tries to complete', async () => {
      const originalFindUnique = prisma.ride.findUnique;
      prisma.ride.findUnique = (async () => makeRide()) as any;

      try {
        await assert.rejects(
          async () => fareService.completeFare('ride-complete-1', 'other-driver-user-id'),
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

    it('should throw 400 when ride status is not IN_PROGRESS or ACCEPTED', async () => {
      const originalFindUnique = prisma.ride.findUnique;
      prisma.ride.findUnique = (async () =>
        makeRide({ status: RideStatus.COMPLETED })
      ) as any;

      try {
        await assert.rejects(
          async () => fareService.completeFare('ride-complete-1', 'driver-user-uuid-1'),
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.strictEqual(err.statusCode, 400);
            assert.ok(err.message.includes('COMPLETED'));
            return true;
          }
        );
      } finally {
        prisma.ride.findUnique = originalFindUnique;
      }
    });

    it('should throw 409 when fare already exists for the ride', async () => {
      const originalRideFindUnique = prisma.ride.findUnique;
      const originalFareFindUnique = prisma.fare.findUnique;

      prisma.ride.findUnique = (async () => makeRide()) as any;
      prisma.fare.findUnique = (async () => ({
        id: 'existing-fare', rideId: 'ride-complete-1',
      })) as any;

      try {
        await assert.rejects(
          async () => fareService.completeFare('ride-complete-1', 'driver-user-uuid-1'),
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.strictEqual(err.statusCode, 409);
            return true;
          }
        );
      } finally {
        prisma.ride.findUnique = originalRideFindUnique;
        prisma.fare.findUnique = originalFareFindUnique;
      }
    });

    it('should fall back to coordinate-based distance when distanceKm is null', async () => {
      const originalRideFindUnique  = prisma.ride.findUnique;
      const originalFareFindUnique  = prisma.fare.findUnique;
      const originalTransaction     = prisma.$transaction;

      let capturedFare: any = null;

      prisma.ride.findUnique = (async () =>
        makeRide({ distanceKm: null })
      ) as any;

      prisma.fare.findUnique = (async () => null) as any;

      (prisma as any).$transaction = (async (fn: any) => {
        const tx = {
          fare: {
            create: async (args: any) => {
              capturedFare = args.data;
              return { id: 'f-2', ...args.data };
            },
          },
          ride: {
            update: async (args: any) => ({
              id: 'ride-complete-1',
              status: RideStatus.COMPLETED,
              distanceKm: args.data.distanceKm,
              passenger: {},
              driver: {},
              fare: null,
            }),
          },
        };
        return fn(tx);
      }) as any;

      try {
        await fareService.completeFare('ride-complete-1', 'driver-user-uuid-1');

        assert.ok(capturedFare, 'fare should be created');
        assert.ok(capturedFare.distanceFare > 0, 'distanceFare must be computed from coordinates');
        assert.ok(capturedFare.totalFare > 0);
      } finally {
        prisma.ride.findUnique  = originalRideFindUnique;
        prisma.fare.findUnique  = originalFareFindUnique;
        (prisma as any).$transaction = originalTransaction;
      }
    });

    it('should use passed-in recordedDistanceKm over stored distanceKm', async () => {
      const originalRideFindUnique  = prisma.ride.findUnique;
      const originalFareFindUnique  = prisma.fare.findUnique;
      const originalTransaction     = prisma.$transaction;

      let capturedFare: any = null;
      let capturedRideUpdate: any = null;

      prisma.ride.findUnique = (async () => makeRide({ distanceKm: 10.0 })) as any;
      prisma.fare.findUnique = (async () => null) as any;

      (prisma as any).$transaction = (async (fn: any) => {
        const tx = {
          fare: {
            create: async (args: any) => {
              capturedFare = args.data;
              return { id: 'f-rec-1', ...args.data };
            },
          },
          ride: {
            update: async (args: any) => {
              capturedRideUpdate = args.data;
              return { id: 'ride-complete-1', ...args.data };
            },
          },
        };
        return fn(tx);
      }) as any;

      try {
        await fareService.completeFare('ride-complete-1', 'driver-user-uuid-1', 14.5);

        const { baseFare, ratePerKm } = FARE_RULES[VehicleType.STANDARD];
        const expectedTotal = parseFloat((baseFare + 14.5 * ratePerKm).toFixed(2));
        assert.strictEqual(capturedFare.totalFare, expectedTotal);
        assert.strictEqual(capturedRideUpdate.distanceKm, 14.5);
      } finally {
        prisma.ride.findUnique  = originalRideFindUnique;
        prisma.fare.findUnique  = originalFareFindUnique;
        (prisma as any).$transaction = originalTransaction;
      }
    });

    it('should throw 400 when negative recordedDistanceKm is provided', async () => {
      await assert.rejects(
        async () => fareService.completeFare('ride-complete-1', 'driver-user-uuid-1', -5),
        (err: any) => {
          assert.ok(err instanceof AppError);
          assert.strictEqual(err.statusCode, 400);
          return true;
        }
      );
    });
  });

  // ─── #18: completeRide controller ────────────────────────────────────────

  describe('Controller - completeRide (POST /api/driver/rides/:id/complete)', () => {
    const makeRide = (overrides: any = {}) => ({
      id: 'ride-ctrl-comp-1',
      status: RideStatus.IN_PROGRESS,
      pickupLat:  PICKUP.lat,
      pickupLng:  PICKUP.lng,
      dropoffLat: DROPOFF.lat,
      dropoffLng: DROPOFF.lng,
      distanceKm: 12.0,
      driver: {
        id: 'driver-id-1',
        vehicleType: VehicleType.STANDARD,
        user: { id: 'driver-user-1' },
      },
      ...overrides,
    });

    it('should return 200 with completed ride and fare data', async () => {
      const originalRideFindUnique  = prisma.ride.findUnique;
      const originalFareFindUnique  = prisma.fare.findUnique;
      const originalTransaction     = prisma.$transaction;

      prisma.ride.findUnique = (async () => makeRide()) as any;
      prisma.fare.findUnique = (async () => null) as any;

      (prisma as any).$transaction = (async (fn: any) => {
        const tx = {
          fare: {
            create: async (args: any) => ({ id: 'fare-ctrl-1', ...args.data }),
          },
          ride: {
            update: async (args: any) => ({
              id: 'ride-ctrl-comp-1',
              status: RideStatus.COMPLETED,
              passenger: { id: 'p-1', name: 'Alice', phone: null, email: 'a@b.com' },
              driver: { id: 'driver-id-1', vehicleType: VehicleType.STANDARD, vehicleModel: 'Swift', vehiclePlate: 'DL01', rating: 4.8 },
              fare: null,
            }),
          },
        };
        return fn(tx);
      }) as any;

      try {
        const req: any = {
          user: { id: 'driver-user-1' },
          params: { id: 'ride-ctrl-comp-1' },
        };
        const res = createMockResponse();

        await completeRide(req, res, (err: any) => { if (err) throw err; });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.message, 'Ride completed successfully');
        assert.ok(res.body.data.ride);
        assert.ok(res.body.data.fare);
      } finally {
        prisma.ride.findUnique  = originalRideFindUnique;
        prisma.fare.findUnique  = originalFareFindUnique;
        (prisma as any).$transaction = originalTransaction;
      }
    });

    it('should forward 403 when a different driver attempts to complete', async () => {
      const originalFindUnique = prisma.ride.findUnique;
      prisma.ride.findUnique = (async () => makeRide()) as any;

      try {
        const req: any = {
          user: { id: 'wrong-driver-user' },
          params: { id: 'ride-ctrl-comp-1' },
        };
        const res = createMockResponse();
        let capturedErr: any = null;

        await completeRide(req, res, (err: any) => { capturedErr = err; });

        assert.ok(capturedErr instanceof AppError);
        assert.strictEqual(capturedErr.statusCode, 403);
      } finally {
        prisma.ride.findUnique = originalFindUnique;
      }
    });

    it('should forward 400 when ride is already COMPLETED', async () => {
      const originalFindUnique = prisma.ride.findUnique;
      prisma.ride.findUnique = (async () =>
        makeRide({ status: RideStatus.COMPLETED })
      ) as any;

      try {
        const req: any = {
          user: { id: 'driver-user-1' },
          params: { id: 'ride-ctrl-comp-1' },
        };
        const res = createMockResponse();
        let capturedErr: any = null;

        await completeRide(req, res, (err: any) => { capturedErr = err; });

        assert.ok(capturedErr instanceof AppError);
        assert.strictEqual(capturedErr.statusCode, 400);
      } finally {
        prisma.ride.findUnique = originalFindUnique;
      }
    });

    it('should accept custom distanceKm in request body', async () => {
      const originalRideFindUnique  = prisma.ride.findUnique;
      const originalFareFindUnique  = prisma.fare.findUnique;
      const originalTransaction     = prisma.$transaction;

      let fareCreated: any = null;

      prisma.ride.findUnique = (async () => makeRide()) as any;
      prisma.fare.findUnique = (async () => null) as any;

      (prisma as any).$transaction = (async (fn: any) => {
        const tx = {
          fare: {
            create: async (args: any) => {
              fareCreated = args.data;
              return { id: 'f-ctrl-rec', ...args.data };
            },
          },
          ride: {
            update: async (args: any) => ({
              id: 'ride-ctrl-comp-1',
              status: RideStatus.COMPLETED,
              passenger: {},
              driver: {},
              fare: null,
            }),
          },
        };
        return fn(tx);
      }) as any;

      try {
        const req: any = {
          user: { id: 'driver-user-1' },
          params: { id: 'ride-ctrl-comp-1' },
          body: { distanceKm: 25.0 },
        };
        const res = createMockResponse();

        await completeRide(req, res, (err: any) => { if (err) throw err; });

        assert.strictEqual(res.statusCode, 200);
        const { baseFare, ratePerKm } = FARE_RULES[VehicleType.STANDARD];
        const expectedTotal = parseFloat((baseFare + 25.0 * ratePerKm).toFixed(2));
        assert.strictEqual(fareCreated.totalFare, expectedTotal);
      } finally {
        prisma.ride.findUnique  = originalRideFindUnique;
        prisma.fare.findUnique  = originalFareFindUnique;
        (prisma as any).$transaction = originalTransaction;
      }
    });

    it('should forward validation error when negative distanceKm is in body', async () => {
      const req: any = {
        user: { id: 'driver-user-1' },
        params: { id: 'ride-ctrl-comp-1' },
        body: { distanceKm: -10 },
      };
      const res = createMockResponse();
      let capturedErr: any = null;

      await completeRide(req, res, (err: any) => { capturedErr = err; });

      assert.ok(capturedErr, 'should fail validation on negative distance');
    });
  });

});
