import { describe, it } from 'node:test';
import assert from 'node:assert';
import { RideStatus, PaymentStatus, VehicleType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { rideService } from '../services/ride.service';
import { getPassengerRideHistory } from '../controllers/passenger.controller';
import { getDriverRideHistory } from '../controllers/driver.controller';

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

describe('Task 41: Ride History Filtering and Search', () => {
  const mockPassengerId = 'passenger-filter-123';
  const mockDriverUserId = 'driver-user-filter-456';
  const mockDriverId = 'driver-profile-filter-789';

  const sampleCompletedRide = {
    id: 'ride-filtered-1',
    passengerId: mockPassengerId,
    driverId: mockDriverId,
    pickupAddress: 'Sector 62, Noida, Uttar Pradesh',
    pickupLat: 28.6279,
    pickupLng: 77.3732,
    dropoffAddress: 'Indira Gandhi International Airport, Delhi',
    dropoffLat: 28.5562,
    dropoffLng: 77.1000,
    distanceKm: 34.2,
    durationMin: 55.0,
    status: RideStatus.COMPLETED,
    createdAt: new Date('2026-10-15T09:30:00Z'),
    updatedAt: new Date('2026-10-15T10:25:00Z'),
    passenger: {
      id: mockPassengerId,
      name: 'Alice Johnson',
      phone: '+919876500001',
      email: 'alice@example.com',
    },
    driver: {
      id: mockDriverId,
      vehicleType: VehicleType.PREMIUM,
      vehicleModel: 'Toyota Camry',
      vehiclePlate: 'DL-01-XY-9999',
      vehicleColor: 'Silver',
      rating: 4.9,
      user: {
        id: mockDriverUserId,
        name: 'Bob Chauffeur',
        phone: '+919876500002',
        email: 'bob@example.com',
      },
    },
    fare: {
      id: 'fare-filter-1',
      rideId: 'ride-filtered-1',
      baseFare: 50,
      distanceFare: 450,
      timeFare: 0,
      surgeMultiplier: 1.2,
      totalFare: 600,
      currency: 'INR',
      paymentStatus: PaymentStatus.COMPLETED,
    },
    feedbacks: [{ rating: 5, comment: 'Punctual and very comfortable!' }],
  };

  describe('Passenger Ride History Filtering Service', () => {
    it('should query with keyword search matching pickup/dropoff address or driver vehicle details', async () => {
      const originalFindMany = prisma.ride.findMany;
      let capturedArgs: any = null;

      prisma.ride.findMany = (async (args: any) => {
        capturedArgs = args;
        return [sampleCompletedRide];
      }) as any;

      try {
        const rides = await rideService.getPassengerRideHistory(mockPassengerId, {
          search: 'Airport',
          status: RideStatus.COMPLETED,
        });

        assert.strictEqual(rides.length, 1);
        assert.ok(capturedArgs);
        assert.strictEqual(capturedArgs.where.passengerId, mockPassengerId);
        assert.strictEqual(capturedArgs.where.status, RideStatus.COMPLETED);
        assert.ok(Array.isArray(capturedArgs.where.OR));
        assert.strictEqual(capturedArgs.where.OR.length, 5);
        assert.deepStrictEqual(capturedArgs.where.OR[0], {
          pickupAddress: { contains: 'Airport', mode: 'insensitive' },
        });
      } finally {
        prisma.ride.findMany = originalFindMany;
      }
    });

    it('should query with fare bounds (minFare and maxFare)', async () => {
      const originalFindMany = prisma.ride.findMany;
      let capturedArgs: any = null;

      prisma.ride.findMany = (async (args: any) => {
        capturedArgs = args;
        return [sampleCompletedRide];
      }) as any;

      try {
        await rideService.getPassengerRideHistory(mockPassengerId, {
          minFare: 200,
          maxFare: 800,
        });

        assert.ok(capturedArgs);
        assert.deepStrictEqual(capturedArgs.where.fare.totalFare, { gte: 200, lte: 800 });
      } finally {
        prisma.ride.findMany = originalFindMany;
      }
    });

    it('should query with date range (startDate / endDate)', async () => {
      const originalFindMany = prisma.ride.findMany;
      let capturedArgs: any = null;

      prisma.ride.findMany = (async (args: any) => {
        capturedArgs = args;
        return [sampleCompletedRide];
      }) as any;

      try {
        await rideService.getPassengerRideHistory(mockPassengerId, {
          startDate: '2026-10-01',
          endDate: '2026-10-31',
        });

        assert.ok(capturedArgs);
        assert.ok(capturedArgs.where.createdAt.gte instanceof Date);
        assert.ok(capturedArgs.where.createdAt.lte instanceof Date);
      } finally {
        prisma.ride.findMany = originalFindMany;
      }
    });

    it('should query with vehicleType and rating filters and sort by fare desc', async () => {
      const originalFindMany = prisma.ride.findMany;
      let capturedArgs: any = null;

      prisma.ride.findMany = (async (args: any) => {
        capturedArgs = args;
        return [sampleCompletedRide];
      }) as any;

      try {
        await rideService.getPassengerRideHistory(mockPassengerId, {
          vehicleType: VehicleType.PREMIUM,
          rating: 4,
          sortBy: 'fare',
          sortOrder: 'desc',
        });

        assert.ok(capturedArgs);
        assert.strictEqual(capturedArgs.where.driver.vehicleType, VehicleType.PREMIUM);
        assert.deepStrictEqual(capturedArgs.where.feedbacks, {
          some: { rating: { gte: 4 } },
        });
        assert.deepStrictEqual(capturedArgs.orderBy, { fare: { totalFare: 'desc' } });
      } finally {
        prisma.ride.findMany = originalFindMany;
      }
    });
  });

  describe('Driver Ride History Filtering Service', () => {
    it('should query driver ride history with passenger search keywords', async () => {
      const originalFindUnique = prisma.driver.findUnique;
      const originalFindMany = prisma.ride.findMany;
      let capturedArgs: any = null;

      prisma.driver.findUnique = (async () => ({ id: mockDriverId, userId: mockDriverUserId })) as any;
      prisma.ride.findMany = (async (args: any) => {
        capturedArgs = args;
        return [sampleCompletedRide];
      }) as any;

      try {
        const rides = await rideService.getDriverRideHistory(mockDriverUserId, {
          search: 'Alice',
          sortBy: 'distance',
          sortOrder: 'asc',
        });

        assert.strictEqual(rides.length, 1);
        assert.ok(capturedArgs);
        assert.strictEqual(capturedArgs.where.driverId, mockDriverId);
        assert.ok(Array.isArray(capturedArgs.where.OR));
        assert.deepStrictEqual(capturedArgs.orderBy, { distanceKm: 'asc' });
      } finally {
        prisma.driver.findUnique = originalFindUnique;
        prisma.ride.findMany = originalFindMany;
      }
    });
  });

  describe('Controllers Query Validation & Response', () => {
    it('should handle passenger ride history query parameters and return filters metadata', async () => {
      const originalFindMany = prisma.ride.findMany;
      prisma.ride.findMany = (async () => [sampleCompletedRide]) as any;

      const req: any = {
        user: { id: mockPassengerId },
        query: {
          search: 'Airport',
          minFare: '300',
          maxFare: '900',
          sortBy: 'fare',
          sortOrder: 'desc',
        },
      };
      const res = createMockResponse();

      try {
        await getPassengerRideHistory(req, res, () => {});

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.rides.length, 1);
        assert.strictEqual(res.body.data.count, 1);
        assert.strictEqual(res.body.data.filters.search, 'Airport');
        assert.strictEqual(res.body.data.filters.minFare, 300);
        assert.strictEqual(res.body.data.filters.maxFare, 900);
        assert.strictEqual(res.body.data.filters.sortBy, 'fare');
      } finally {
        prisma.ride.findMany = originalFindMany;
      }
    });

    it('should handle driver ride history query parameters and return filters metadata', async () => {
      const originalFindUnique = prisma.driver.findUnique;
      const originalFindMany = prisma.ride.findMany;

      prisma.driver.findUnique = (async () => ({ id: mockDriverId, userId: mockDriverUserId })) as any;
      prisma.ride.findMany = (async () => [sampleCompletedRide]) as any;

      const req: any = {
        user: { id: mockDriverUserId },
        query: {
          search: 'Sector 62',
          sortBy: 'date',
          sortOrder: 'desc',
        },
      };
      const res = createMockResponse();

      try {
        await getDriverRideHistory(req, res, () => {});

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.rides.length, 1);
        assert.strictEqual(res.body.data.filters.search, 'Sector 62');
      } finally {
        prisma.driver.findUnique = originalFindUnique;
        prisma.ride.findMany = originalFindMany;
      }
    });
  });
});
