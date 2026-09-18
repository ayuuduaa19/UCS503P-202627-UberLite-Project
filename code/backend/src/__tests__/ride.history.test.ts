import { describe, it } from 'node:test';
import assert from 'node:assert';
import { RideStatus, PaymentStatus, VehicleType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { rideService } from '../services/ride.service';
import {
  getPassengerRideHistory,
  getPassengerRides,
} from '../controllers/passenger.controller';
import {
  getDriverRideHistory,
  getDriverRides,
} from '../controllers/driver.controller';

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

describe('Task 19: Ride History API', () => {
  const mockPassengerId = 'passenger-uuid-123';
  const mockDriverUserId = 'driver-user-uuid-456';
  const mockDriverId = 'driver-uuid-789';

  const mockCompletedRide = {
    id: 'ride-completed-1',
    passengerId: mockPassengerId,
    driverId: mockDriverId,
    pickupAddress: 'Connaught Place, New Delhi',
    pickupLat: 28.6315,
    pickupLng: 77.2167,
    dropoffAddress: 'Cyber City, Gurugram',
    dropoffLat: 28.4952,
    dropoffLng: 77.0895,
    distanceKm: 28.5,
    durationMin: 40.0,
    status: RideStatus.COMPLETED,
    createdAt: new Date('2026-09-18T10:00:00Z'),
    updatedAt: new Date('2026-09-18T10:45:00Z'),
    passenger: {
      id: mockPassengerId,
      name: 'John Passenger',
      phone: '+919876543210',
      email: 'john@example.com',
    },
    driver: {
      id: mockDriverId,
      vehicleType: VehicleType.STANDARD,
      vehicleModel: 'Honda City',
      vehiclePlate: 'DL-01-AB-1234',
      vehicleColor: 'White',
      rating: 4.8,
      user: {
        id: mockDriverUserId,
        name: 'Jane Driver',
        phone: '+919876543211',
        email: 'jane@example.com',
      },
    },
    fare: {
      id: 'fare-uuid-1',
      rideId: 'ride-completed-1',
      baseFare: 30,
      distanceFare: 342,
      timeFare: 0,
      surgeMultiplier: 1.0,
      totalFare: 372,
      currency: 'INR',
      paymentStatus: PaymentStatus.COMPLETED,
      paymentMethod: 'CASH',
      createdAt: new Date('2026-09-18T10:45:00Z'),
      updatedAt: new Date('2026-09-18T10:45:00Z'),
    },
    feedbacks: [],
  };

  describe('Passenger Ride History Service Layer', () => {
    it('should retrieve passenger completed ride history with locations, driver info, fare, timestamps, and status', async () => {
      const originalFindMany = prisma.ride.findMany;
      prisma.ride.findMany = (async (args: any) => {
        assert.strictEqual(args.where.passengerId, mockPassengerId);
        assert.strictEqual(args.where.status, RideStatus.COMPLETED);
        return [mockCompletedRide];
      }) as any;

      try {
        const history = await rideService.getPassengerRideHistory(mockPassengerId);
        assert.strictEqual(history.length, 1);
        const ride = history[0];

        // Locations
        assert.strictEqual(ride.pickupAddress, 'Connaught Place, New Delhi');
        assert.strictEqual(ride.pickupLat, 28.6315);
        assert.strictEqual(ride.pickupLng, 77.2167);
        assert.strictEqual(ride.dropoffAddress, 'Cyber City, Gurugram');
        assert.strictEqual(ride.dropoffLat, 28.4952);
        assert.strictEqual(ride.dropoffLng, 77.0895);
        assert.strictEqual(ride.distanceKm, 28.5);

        // Driver details
        assert.ok(ride.driver);
        assert.strictEqual(ride.driver.vehicleModel, 'Honda City');
        assert.strictEqual(ride.driver.vehiclePlate, 'DL-01-AB-1234');
        assert.strictEqual(ride.driver.rating, 4.8);

        // Fare
        assert.ok(ride.fare);
        assert.strictEqual(ride.fare.totalFare, 372);
        assert.strictEqual(ride.fare.paymentStatus, PaymentStatus.COMPLETED);

        // Timestamps & status
        assert.strictEqual(ride.status, RideStatus.COMPLETED);
        assert.ok(ride.createdAt);
        assert.ok(ride.updatedAt);
      } finally {
        prisma.ride.findMany = originalFindMany;
      }
    });

    it('should allow filtering passenger rides by custom status', async () => {
      const originalFindMany = prisma.ride.findMany;
      prisma.ride.findMany = (async (args: any) => {
        assert.strictEqual(args.where.passengerId, mockPassengerId);
        assert.strictEqual(args.where.status, RideStatus.IN_PROGRESS);
        return [{ ...mockCompletedRide, status: RideStatus.IN_PROGRESS }];
      }) as any;

      try {
        const rides = await rideService.getPassengerRides(mockPassengerId, RideStatus.IN_PROGRESS);
        assert.strictEqual(rides.length, 1);
        assert.strictEqual(rides[0].status, RideStatus.IN_PROGRESS);
      } finally {
        prisma.ride.findMany = originalFindMany;
      }
    });
  });

  describe('Driver Ride History Service Layer', () => {
    it('should retrieve driver completed ride history with passenger info, locations, and fare', async () => {
      const originalDriverFindUnique = prisma.driver.findUnique;
      const originalRideFindMany = prisma.ride.findMany;

      prisma.driver.findUnique = (async () => ({ id: mockDriverId, userId: mockDriverUserId })) as any;
      prisma.ride.findMany = (async (args: any) => {
        assert.strictEqual(args.where.driverId, mockDriverId);
        assert.strictEqual(args.where.status, RideStatus.COMPLETED);
        return [mockCompletedRide];
      }) as any;

      try {
        const history = await rideService.getDriverRideHistory(mockDriverUserId);
        assert.strictEqual(history.length, 1);
        const ride = history[0];

        // Passenger info
        assert.ok(ride.passenger);
        assert.strictEqual(ride.passenger.name, 'John Passenger');
        assert.strictEqual(ride.passenger.phone, '+919876543210');

        // Locations & Fare
        assert.strictEqual(ride.pickupAddress, 'Connaught Place, New Delhi');
        assert.strictEqual(ride.dropoffAddress, 'Cyber City, Gurugram');
        assert.strictEqual(ride.fare.totalFare, 372);
        assert.strictEqual(ride.status, RideStatus.COMPLETED);
      } finally {
        prisma.driver.findUnique = originalDriverFindUnique;
        prisma.ride.findMany = originalRideFindMany;
      }
    });

    it('should throw 404 error if driver profile is not found', async () => {
      const originalDriverFindUnique = prisma.driver.findUnique;
      prisma.driver.findUnique = (async () => null) as any;

      try {
        await assert.rejects(
          async () => {
            await rideService.getDriverRideHistory('non-existent-driver');
          },
          (err: any) => {
            assert.strictEqual(err.statusCode, 404);
            assert.ok(err.message.includes('Driver profile not found'));
            return true;
          }
        );
      } finally {
        prisma.driver.findUnique = originalDriverFindUnique;
      }
    });
  });

  describe('Passenger & Driver History Controllers', () => {
    it('should respond 200 with passenger completed ride history from getPassengerRideHistory', async () => {
      const originalFindMany = prisma.ride.findMany;
      prisma.ride.findMany = (async () => [mockCompletedRide]) as any;

      const req: any = {
        user: { id: mockPassengerId },
        query: {},
      };
      const res = createMockResponse();
      let nextError: any = null;

      try {
        await getPassengerRideHistory(req, res, (err: any) => {
          nextError = err;
        });

        assert.strictEqual(nextError, null);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.rides.length, 1);
        assert.strictEqual(res.body.data.count, 1);
        assert.strictEqual(res.body.data.rides[0].pickupAddress, 'Connaught Place, New Delhi');
      } finally {
        prisma.ride.findMany = originalFindMany;
      }
    });

    it('should respond 200 with driver completed ride history from getDriverRideHistory', async () => {
      const originalDriverFindUnique = prisma.driver.findUnique;
      const originalRideFindMany = prisma.ride.findMany;

      prisma.driver.findUnique = (async () => ({ id: mockDriverId, userId: mockDriverUserId })) as any;
      prisma.ride.findMany = (async () => [mockCompletedRide]) as any;

      const req: any = {
        user: { id: mockDriverUserId },
        query: {},
      };
      const res = createMockResponse();
      let nextError: any = null;

      try {
        await getDriverRideHistory(req, res, (err: any) => {
          nextError = err;
        });

        assert.strictEqual(nextError, null);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.rides.length, 1);
        assert.strictEqual(res.body.data.count, 1);
        assert.strictEqual(res.body.data.rides[0].passenger.name, 'John Passenger');
      } finally {
        prisma.driver.findUnique = originalDriverFindUnique;
        prisma.ride.findMany = originalRideFindMany;
      }
    });
  });
});
