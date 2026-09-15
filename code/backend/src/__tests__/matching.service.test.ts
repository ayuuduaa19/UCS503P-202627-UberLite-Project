import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Role, RideStatus, VehicleType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { authorize } from '../middleware/auth.middleware';
import { matchingService } from '../services/matching.service';
import {
  matchingOptionsSchema,
  findNearbyDriversSchema,
  assignDriverSchema,
} from '../validators/matching.validator';
import {
  matchRideWithDriver,
  assignRideDriver,
  getNearbyDrivers,
} from '../controllers/passenger.controller';

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

describe('Location-Based Matching Service', () => {
  describe('Validation Schemas', () => {
    it('matchingOptionsSchema should provide sensible defaults', () => {
      const result = matchingOptionsSchema.safeParse({});
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.maxRadiusKm, 10.0);
        assert.strictEqual(result.data.limit, 10);
      }
    });

    it('matchingOptionsSchema should reject negative radius or non-positive limit', () => {
      const negRadius = matchingOptionsSchema.safeParse({ maxRadiusKm: -5 });
      assert.strictEqual(negRadius.success, false);

      const zeroLimit = matchingOptionsSchema.safeParse({ limit: 0 });
      assert.strictEqual(zeroLimit.success, false);
    });

    it('findNearbyDriversSchema should validate valid pickup coordinates', () => {
      const valid = findNearbyDriversSchema.safeParse({
        pickupLat: 28.6139,
        pickupLng: 77.209,
        maxRadiusKm: 5.0,
      });
      assert.strictEqual(valid.success, true);
    });

    it('findNearbyDriversSchema should reject invalid coordinates', () => {
      const invalidLat = findNearbyDriversSchema.safeParse({
        pickupLat: 95.0,
        pickupLng: 77.209,
      });
      assert.strictEqual(invalidLat.success, false);

      const invalidLng = findNearbyDriversSchema.safeParse({
        pickupLat: 28.6139,
        pickupLng: -190.0,
      });
      assert.strictEqual(invalidLng.success, false);

      const missing = findNearbyDriversSchema.safeParse({});
      assert.strictEqual(missing.success, false);
    });

    it('assignDriverSchema should require non-empty driverId', () => {
      const valid = assignDriverSchema.safeParse({ driverId: 'driver-123' });
      assert.strictEqual(valid.success, true);

      const empty = assignDriverSchema.safeParse({ driverId: '' });
      assert.strictEqual(empty.success, false);
    });
  });

  describe('Finding Available Drivers & Distance Calculation', () => {
    const pickupLocation = { lat: 28.6139, lng: 77.209 }; // Connaught Place, New Delhi

    it('should find available drivers, compute distance and arrival time, sorted ascending', async () => {
      const originalFindMany = prisma.driver.findMany;

      // Mock database drivers
      prisma.driver.findMany = (async (args: any) => {
        assert.strictEqual(args.where.isAvailable, true);
        return [
          {
            id: 'driver-medium',
            userId: 'user-med',
            licenseNumber: 'DL-02',
            vehicleType: VehicleType.STANDARD,
            vehicleModel: 'Honda City',
            vehiclePlate: 'DL-02-CD-5678',
            vehicleColor: 'White',
            isAvailable: true,
            currentLat: 28.6289,
            currentLng: 77.2065, // ~1.68 km
            rating: 4.8,
            user: { id: 'user-med', name: 'Bob Driver', phone: '+919876543202' },
          },
          {
            id: 'driver-close',
            userId: 'user-close',
            licenseNumber: 'DL-01',
            vehicleType: VehicleType.STANDARD,
            vehicleModel: 'Maruti Dzire',
            vehiclePlate: 'DL-01-AB-1234',
            vehicleColor: 'Silver',
            isAvailable: true,
            currentLat: 28.615,
            currentLng: 77.2105, // ~0.19 km
            rating: 4.9,
            user: { id: 'user-close', name: 'Alice Driver', phone: '+919876543201' },
          },
          {
            id: 'driver-far',
            userId: 'user-far',
            licenseNumber: 'DL-03',
            vehicleType: VehicleType.STANDARD,
            vehicleModel: 'Hyundai Verna',
            vehiclePlate: 'DL-03-EF-9012',
            vehicleColor: 'Black',
            isAvailable: true,
            currentLat: 28.7041,
            currentLng: 77.1025, // ~14.4 km
            rating: 4.7,
            user: { id: 'user-far', name: 'Charlie Driver', phone: '+919876543203' },
          },
        ] as any;
      }) as any;

      try {
        const drivers = await matchingService.findAvailableDrivers(pickupLocation, {
          maxRadiusKm: 10.0,
        });

        // Far driver (~14.4 km) should be excluded since maxRadiusKm is 10.0
        assert.strictEqual(drivers.length, 2);

        // Nearest driver should be first
        assert.strictEqual(drivers[0].driverId, 'driver-close');
        assert.strictEqual(drivers[0].name, 'Alice Driver');
        assert.ok(drivers[0].distanceKm < 0.5);
        assert.ok(drivers[0].estimatedArrivalMin >= 0);

        // Medium driver should be second
        assert.strictEqual(drivers[1].driverId, 'driver-medium');
        assert.strictEqual(drivers[1].name, 'Bob Driver');
        assert.ok(drivers[1].distanceKm > drivers[0].distanceKm);
      } finally {
        prisma.driver.findMany = originalFindMany;
      }
    });

    it('should filter available drivers by vehicleType when specified', async () => {
      const originalFindMany = prisma.driver.findMany;
      let capturedWhere: any = null;

      prisma.driver.findMany = (async (args: any) => {
        capturedWhere = args.where;
        return [
          {
            id: 'driver-prem',
            userId: 'user-prem',
            licenseNumber: 'DL-PREM-01',
            vehicleType: VehicleType.PREMIUM,
            vehicleModel: 'Audi A4',
            vehiclePlate: 'DL-04-PR-1111',
            vehicleColor: 'Black',
            isAvailable: true,
            currentLat: 28.618,
            currentLng: 77.21,
            rating: 4.95,
            user: { id: 'user-prem', name: 'Premium Driver', phone: '+919876543299' },
          },
        ] as any;
      }) as any;

      try {
        const drivers = await matchingService.findAvailableDrivers(pickupLocation, {
          vehicleType: VehicleType.PREMIUM,
        });

        assert.strictEqual(capturedWhere.vehicleType, VehicleType.PREMIUM);
        assert.strictEqual(drivers.length, 1);
        assert.strictEqual(drivers[0].vehicleType, VehicleType.PREMIUM);
      } finally {
        prisma.driver.findMany = originalFindMany;
      }
    });

    it('should skip drivers with missing or invalid coordinates', async () => {
      const originalFindMany = prisma.driver.findMany;

      prisma.driver.findMany = (async () => {
        return [
          {
            id: 'driver-no-lat',
            isAvailable: true,
            currentLat: null,
            currentLng: 77.2,
            user: { name: 'No Lat' },
          },
          {
            id: 'driver-bad-lat',
            isAvailable: true,
            currentLat: 999.0, // Invalid latitude
            currentLng: 77.2,
            user: { name: 'Bad Lat' },
          },
          {
            id: 'driver-valid',
            isAvailable: true,
            currentLat: 28.615,
            currentLng: 77.21,
            rating: 5.0,
            vehicleType: VehicleType.STANDARD,
            user: { name: 'Valid Driver' },
          },
        ] as any;
      }) as any;

      try {
        const drivers = await matchingService.findAvailableDrivers(pickupLocation);
        assert.strictEqual(drivers.length, 1);
        assert.strictEqual(drivers[0].driverId, 'driver-valid');
      } finally {
        prisma.driver.findMany = originalFindMany;
      }
    });
  });

  describe('Selecting the Nearest Suitable Driver', () => {
    const pickupLocation = { lat: 28.6139, lng: 77.209 };

    it('findNearestDriver should return the single closest suitable driver', async () => {
      const originalFindMany = prisma.driver.findMany;

      prisma.driver.findMany = (async () => {
        return [
          {
            id: 'driver-2km',
            licenseNumber: 'DL-2',
            vehicleType: VehicleType.STANDARD,
            isAvailable: true,
            currentLat: 28.63,
            currentLng: 77.21,
            rating: 4.8,
            user: { name: 'Driver 2km' },
          },
          {
            id: 'driver-closest',
            licenseNumber: 'DL-1',
            vehicleType: VehicleType.STANDARD,
            isAvailable: true,
            currentLat: 28.6145,
            currentLng: 77.2095,
            rating: 4.9,
            user: { name: 'Closest Driver' },
          },
        ] as any;
      }) as any;

      try {
        const nearest = await matchingService.findNearestDriver(pickupLocation);
        assert.notStrictEqual(nearest, null);
        assert.strictEqual(nearest?.driverId, 'driver-closest');
        assert.strictEqual(nearest?.name, 'Closest Driver');
      } finally {
        prisma.driver.findMany = originalFindMany;
      }
    });

    it('findNearestDriver should return null when no drivers are available or within radius', async () => {
      const originalFindMany = prisma.driver.findMany;

      prisma.driver.findMany = (async () => {
        return [] as any;
      }) as any;

      try {
        const nearest = await matchingService.findNearestDriver(pickupLocation);
        assert.strictEqual(nearest, null);
      } finally {
        prisma.driver.findMany = originalFindMany;
      }
    });
  });

  describe('Preventing Assignment to Unavailable Drivers & Ride Matching', () => {
    it('validateDriverAvailability should return isEligible: false when driver is unavailable', async () => {
      const originalFindUnique = prisma.driver.findUnique;

      prisma.driver.findUnique = (async () => {
        return {
          id: 'driver-offline',
          isAvailable: false,
          currentLat: 28.6,
          currentLng: 77.2,
        } as any;
      }) as any;

      try {
        const result = await matchingService.validateDriverAvailability('driver-offline');
        assert.strictEqual(result.isEligible, false);
        assert.strictEqual(result.reason, 'Driver is currently unavailable');
      } finally {
        prisma.driver.findUnique = originalFindUnique;
      }
    });

    it('validateDriverAvailability should return isEligible: false when driver profile does not exist', async () => {
      const originalFindUnique = prisma.driver.findUnique;
      prisma.driver.findUnique = (async () => null) as any;

      try {
        const result = await matchingService.validateDriverAvailability('non-existent');
        assert.strictEqual(result.isEligible, false);
        assert.strictEqual(result.reason, 'Driver profile not found');
      } finally {
        prisma.driver.findUnique = originalFindUnique;
      }
    });

    it('validateDriverAvailability should return isEligible: false when driver location is missing', async () => {
      const originalFindUnique = prisma.driver.findUnique;

      prisma.driver.findUnique = (async () => {
        return {
          id: 'driver-no-location',
          isAvailable: true,
          currentLat: null,
          currentLng: null,
        } as any;
      }) as any;

      try {
        const result = await matchingService.validateDriverAvailability('driver-no-location');
        assert.strictEqual(result.isEligible, false);
        assert.strictEqual(result.reason, 'Driver does not have a valid location recorded');
      } finally {
        prisma.driver.findUnique = originalFindUnique;
      }
    });

    it('assignDriverToRide should PREVENT assignment to unavailable driver with 400 AppError', async () => {
      const originalRideFind = prisma.ride.findUnique;
      const originalDriverFind = prisma.driver.findUnique;

      prisma.ride.findUnique = (async () => ({
        id: 'ride-1',
        passengerId: 'p-1',
        status: RideStatus.REQUESTED,
        pickupLat: 28.6,
        pickupLng: 77.2,
      })) as any;

      prisma.driver.findUnique = (async () => ({
        id: 'driver-unavailable',
        isAvailable: false, // Driver is unavailable!
        currentLat: 28.6,
        currentLng: 77.2,
      })) as any;

      try {
        await assert.rejects(
          async () => {
            await matchingService.assignDriverToRide('ride-1', 'driver-unavailable', 'p-1');
          },
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.strictEqual(err.statusCode, 400);
            assert.strictEqual(err.message, 'Driver is currently unavailable');
            return true;
          }
        );
      } finally {
        prisma.ride.findUnique = originalRideFind;
        prisma.driver.findUnique = originalDriverFind;
      }
    });

    it('assignDriverToRide should prevent assignment if ride is already MATCHED or completed', async () => {
      const originalRideFind = prisma.ride.findUnique;

      prisma.ride.findUnique = (async () => ({
        id: 'ride-already-matched',
        passengerId: 'p-1',
        status: RideStatus.MATCHED, // Not REQUESTED!
        pickupLat: 28.6,
        pickupLng: 77.2,
      })) as any;

      try {
        await assert.rejects(
          async () => {
            await matchingService.assignDriverToRide('ride-already-matched', 'driver-1', 'p-1');
          },
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.strictEqual(err.statusCode, 400);
            assert.ok(err.message.includes('cannot be assigned'));
            return true;
          }
        );
      } finally {
        prisma.ride.findUnique = originalRideFind;
      }
    });

    it('assignDriverToRide should successfully assign available driver and set driver isAvailable = false', async () => {
      const originalRideFind = prisma.ride.findUnique;
      const originalDriverFind = prisma.driver.findUnique;
      const originalDriverUpdate = prisma.driver.update;
      const originalRideUpdate = prisma.ride.update;
      const originalTx = prisma.$transaction;

      let updatedDriverData: any = null;
      let updatedRideData: any = null;

      prisma.$transaction = (async (cb: any) => cb(prisma)) as any;

      prisma.ride.findUnique = (async () => ({
        id: 'ride-to-assign',
        passengerId: 'p-1',
        status: RideStatus.REQUESTED,
        pickupLat: 28.6139,
        pickupLng: 77.209,
      })) as any;

      prisma.driver.findUnique = (async () => ({
        id: 'driver-avail',
        userId: 'u-driver',
        isAvailable: true,
        currentLat: 28.615,
        currentLng: 77.21,
        licenseNumber: 'DL-99',
        vehicleType: VehicleType.STANDARD,
        vehicleModel: 'Swift',
        vehiclePlate: 'DL-01-XX-9999',
        rating: 4.9,
        user: { name: 'Available Dave', phone: '+919999999999' },
      })) as any;

      prisma.driver.update = (async (args: any) => {
        updatedDriverData = args.data;
        return { id: args.where.id, ...args.data };
      }) as any;

      prisma.ride.update = (async (args: any) => {
        updatedRideData = args.data;
        return {
          id: args.where.id,
          driverId: args.data.driverId,
          status: args.data.status,
          passenger: { id: 'p-1', name: 'Alice' },
          driver: { id: args.data.driverId, vehicleModel: 'Swift' },
        };
      }) as any;

      try {
        const result = await matchingService.assignDriverToRide('ride-to-assign', 'driver-avail', 'p-1');

        // Check that driver is now marked unavailable to prevent double-assignment
        assert.strictEqual(updatedDriverData.isAvailable, false);
        // Check that ride is updated to MATCHED status with driverId
        assert.strictEqual(updatedRideData.driverId, 'driver-avail');
        assert.strictEqual(updatedRideData.status, RideStatus.MATCHED);

        assert.strictEqual(result.matchedDriver.driverId, 'driver-avail');
        assert.ok(result.matchedDriver.distanceKm >= 0);
      } finally {
        prisma.ride.findUnique = originalRideFind;
        prisma.driver.findUnique = originalDriverFind;
        prisma.driver.update = originalDriverUpdate;
        prisma.ride.update = originalRideUpdate;
        prisma.$transaction = originalTx;
      }
    });

    it('matchDriverForRide should automatically match the nearest driver and update states', async () => {
      const originalRideFind = prisma.ride.findUnique;
      const originalDriverFindMany = prisma.driver.findMany;
      const originalDriverFindUnique = prisma.driver.findUnique;
      const originalDriverUpdate = prisma.driver.update;
      const originalRideUpdate = prisma.ride.update;
      const originalTx = prisma.$transaction;

      let driverUpdatedAvailable: boolean | null = null;
      let rideUpdatedStatus: RideStatus | null = null;
      let rideUpdatedDriverId: string | null = null;

      prisma.$transaction = (async (cb: any) => cb(prisma)) as any;

      prisma.ride.findUnique = (async () => ({
        id: 'ride-req-1',
        passengerId: 'p-1',
        status: RideStatus.REQUESTED,
        pickupLat: 28.6139,
        pickupLng: 77.209,
      })) as any;

      prisma.driver.findMany = (async () => [
        {
          id: 'driver-near',
          userId: 'u-near',
          isAvailable: true,
          currentLat: 28.6145,
          currentLng: 77.2092,
          licenseNumber: 'DL-NEAR',
          vehicleType: VehicleType.STANDARD,
          vehicleModel: 'Honda City',
          vehiclePlate: 'DL-01-AA-1111',
          rating: 4.95,
          user: { name: 'Near Driver', phone: '+919888888888' },
        },
      ]) as any;

      prisma.driver.findUnique = (async () => ({
        id: 'driver-near',
        isAvailable: true,
      })) as any;

      prisma.driver.update = (async (args: any) => {
        driverUpdatedAvailable = args.data.isAvailable;
        return { id: args.where.id, isAvailable: args.data.isAvailable };
      }) as any;

      prisma.ride.update = (async (args: any) => {
        rideUpdatedStatus = args.data.status;
        rideUpdatedDriverId = args.data.driverId;
        return {
          id: args.where.id,
          status: args.data.status,
          driverId: args.data.driverId,
        };
      }) as any;

      try {
        const result = await matchingService.matchDriverForRide('ride-req-1', {}, 'p-1');

        assert.strictEqual(driverUpdatedAvailable, false);
        assert.strictEqual(rideUpdatedStatus, RideStatus.MATCHED);
        assert.strictEqual(rideUpdatedDriverId, 'driver-near');
        assert.strictEqual(result.matchedDriver.driverId, 'driver-near');
      } finally {
        prisma.ride.findUnique = originalRideFind;
        prisma.driver.findMany = originalDriverFindMany;
        prisma.driver.findUnique = originalDriverFindUnique;
        prisma.driver.update = originalDriverUpdate;
        prisma.ride.update = originalRideUpdate;
        prisma.$transaction = originalTx;
      }
    });

    it('matchDriverForRide should throw 404 when no drivers are found in radius', async () => {
      const originalRideFind = prisma.ride.findUnique;
      const originalDriverFindMany = prisma.driver.findMany;

      prisma.ride.findUnique = (async () => ({
        id: 'ride-desert',
        passengerId: 'p-1',
        status: RideStatus.REQUESTED,
        pickupLat: 28.6139,
        pickupLng: 77.209,
      })) as any;

      prisma.driver.findMany = (async () => []) as any; // No drivers

      try {
        await assert.rejects(
          async () => {
            await matchingService.matchDriverForRide('ride-desert', { maxRadiusKm: 5.0 }, 'p-1');
          },
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.strictEqual(err.statusCode, 404);
            assert.ok(err.message.includes('No available drivers found'));
            return true;
          }
        );
      } finally {
        prisma.ride.findUnique = originalRideFind;
        prisma.driver.findMany = originalDriverFindMany;
      }
    });

    it('matchDriverForRide should reject matching if passenger does not own the ride', async () => {
      const originalRideFind = prisma.ride.findUnique;

      prisma.ride.findUnique = (async () => ({
        id: 'ride-other',
        passengerId: 'other-passenger',
        status: RideStatus.REQUESTED,
        pickupLat: 28.6,
        pickupLng: 77.2,
      })) as any;

      try {
        await assert.rejects(
          async () => {
            await matchingService.matchDriverForRide('ride-other', {}, 'p-1');
          },
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.strictEqual(err.statusCode, 403);
            assert.ok(err.message.includes('Unauthorized'));
            return true;
          }
        );
      } finally {
        prisma.ride.findUnique = originalRideFind;
      }
    });
  });

  describe('Passenger Controller Endpoints for Matching', () => {
    it('matchRideWithDriver should return 200 and matched driver data', async () => {
      const originalMatch = matchingService.matchDriverForRide;
      matchingService.matchDriverForRide = (async () => ({
        ride: { id: 'r-1', status: RideStatus.MATCHED, driverId: 'd-1' },
        matchedDriver: { driverId: 'd-1', name: 'Dan', distanceKm: 1.2, estimatedArrivalMin: 2.4 },
      })) as any;

      const req: any = {
        params: { id: 'r-1' },
        user: { id: 'p-1', role: Role.PASSENGER },
        body: { maxRadiusKm: 10.0 },
      };
      const res = createMockResponse();
      let nextCalled = false;

      try {
        await matchRideWithDriver(req, res, ((err: any) => {
          if (err) nextCalled = true;
        }) as any);

        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.matchedDriver.driverId, 'd-1');
        assert.strictEqual(res.body.data.ride.status, RideStatus.MATCHED);
      } finally {
        matchingService.matchDriverForRide = originalMatch;
      }
    });

    it('assignRideDriver should return 200 and assigned driver data', async () => {
      const originalAssign = matchingService.assignDriverToRide;
      matchingService.assignDriverToRide = (async () => ({
        ride: { id: 'r-1', status: RideStatus.MATCHED, driverId: 'd-2' },
        matchedDriver: { driverId: 'd-2', name: 'Dave', distanceKm: 0.8, estimatedArrivalMin: 1.6 },
      })) as any;

      const req: any = {
        params: { id: 'r-1' },
        user: { id: 'p-1', role: Role.PASSENGER },
        body: { driverId: 'd-2' },
      };
      const res = createMockResponse();
      let nextCalled = false;

      try {
        await assignRideDriver(req, res, ((err: any) => {
          if (err) nextCalled = true;
        }) as any);

        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.matchedDriver.driverId, 'd-2');
      } finally {
        matchingService.assignDriverToRide = originalAssign;
      }
    });

    it('getNearbyDrivers should return 200 and list of nearby drivers with distances', async () => {
      const originalFind = matchingService.findAvailableDrivers;
      matchingService.findAvailableDrivers = (async () => [
        { driverId: 'd-1', name: 'Driver 1', distanceKm: 1.5, estimatedArrivalMin: 3.0 },
        { driverId: 'd-2', name: 'Driver 2', distanceKm: 2.8, estimatedArrivalMin: 5.6 },
      ]) as any;

      const req: any = {
        user: { id: 'p-1', role: Role.PASSENGER },
        body: { pickupLat: 28.6139, pickupLng: 77.209, maxRadiusKm: 5.0 },
      };
      const res = createMockResponse();
      let nextCalled = false;

      try {
        await getNearbyDrivers(req, res, ((err: any) => {
          if (err) nextCalled = true;
        }) as any);

        assert.strictEqual(nextCalled, false);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.count, 2);
        assert.strictEqual(res.body.data.drivers[0].distanceKm, 1.5);
      } finally {
        matchingService.findAvailableDrivers = originalFind;
      }
    });

    it('should enforce PASSENGER role on matching endpoints', () => {
      const passengerGuard = authorize(Role.PASSENGER);

      let passengerAllowed = false;
      const passengerReq: any = { user: { id: 'p-1', role: Role.PASSENGER } };
      passengerGuard(passengerReq, {} as any, (err?: any) => {
        if (!err) passengerAllowed = true;
      });
      assert.strictEqual(passengerAllowed, true);

      let driverRejected = false;
      const driverReq: any = { user: { id: 'd-1', role: Role.DRIVER } };
      passengerGuard(driverReq, {} as any, (err?: any) => {
        if (err instanceof AppError && err.statusCode === 403) {
          driverRejected = true;
        }
      });
      assert.strictEqual(driverRejected, true);
    });
  });
});
