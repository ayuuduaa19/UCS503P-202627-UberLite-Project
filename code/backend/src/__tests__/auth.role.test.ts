import { describe, it } from 'node:test';
import assert from 'node:assert';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import {
  authenticate,
  authorize,
  authorizeRoles,
  requireRole,
  requirePassenger,
  requireDriver,
  requireAdmin,
} from '../middleware/auth.middleware';
import { AppError } from '../middleware/errorHandler';
import { config } from '../config';
import { signToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import {
  getPassengerProfile,
  getPassengerRides,
  requestRide,
} from '../controllers/passenger.controller';
import {
  getDriverProfile,
  updateAvailability,
  getDriverRides,
} from '../controllers/driver.controller';

// Helper to create mock Express response
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

describe('Role-Based Authorization Middleware', () => {
  describe('authorize / authorizeRoles middleware', () => {
    it('should reject unauthenticated request with 401 AppError when req.user is undefined', () => {
      const req: any = {};
      const res: any = createMockResponse();
      let errorPassed: any = null;

      const middleware = authorize(Role.PASSENGER);
      middleware(req, res, (err?: any) => {
        errorPassed = err;
      });

      assert.ok(errorPassed instanceof AppError);
      assert.strictEqual(errorPassed.statusCode, 401);
      assert.strictEqual(errorPassed.message, 'Authentication required');
    });

    it('should reject PASSENGER user accessing DRIVER-only endpoint with 403 AppError', () => {
      const req: any = {
        user: {
          id: 'user-passenger-1',
          email: 'passenger@uberlite.local',
          role: Role.PASSENGER,
        },
      };
      const res: any = createMockResponse();
      let errorPassed: any = null;

      const middleware = authorize(Role.DRIVER);
      middleware(req, res, (err?: any) => {
        errorPassed = err;
      });

      assert.ok(errorPassed instanceof AppError);
      assert.strictEqual(errorPassed.statusCode, 403);
      assert.strictEqual(errorPassed.message, 'You do not have permission to perform this action');
    });

    it('should reject DRIVER user accessing PASSENGER-only endpoint with 403 AppError', () => {
      const req: any = {
        user: {
          id: 'user-driver-1',
          email: 'driver@uberlite.local',
          role: Role.DRIVER,
        },
      };
      const res: any = createMockResponse();
      let errorPassed: any = null;

      const middleware = authorize(Role.PASSENGER);
      middleware(req, res, (err?: any) => {
        errorPassed = err;
      });

      assert.ok(errorPassed instanceof AppError);
      assert.strictEqual(errorPassed.statusCode, 403);
      assert.strictEqual(errorPassed.message, 'You do not have permission to perform this action');
    });

    it('should allow PASSENGER user accessing PASSENGER endpoint (calls next without error)', () => {
      const req: any = {
        user: {
          id: 'user-passenger-1',
          email: 'passenger@uberlite.local',
          role: Role.PASSENGER,
        },
      };
      const res: any = createMockResponse();
      let nextCalled = false;
      let errorPassed: any = null;

      const middleware = authorize(Role.PASSENGER);
      middleware(req, res, (err?: any) => {
        nextCalled = true;
        errorPassed = err;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(errorPassed, undefined);
    });

    it('should allow DRIVER user accessing DRIVER endpoint (calls next without error)', () => {
      const req: any = {
        user: {
          id: 'user-driver-1',
          email: 'driver@uberlite.local',
          role: Role.DRIVER,
        },
      };
      const res: any = createMockResponse();
      let nextCalled = false;
      let errorPassed: any = null;

      const middleware = authorize(Role.DRIVER);
      middleware(req, res, (err?: any) => {
        nextCalled = true;
        errorPassed = err;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(errorPassed, undefined);
    });

    it('should allow multiple authorized roles (e.g. PASSENGER or DRIVER)', () => {
      const middleware = authorizeRoles(Role.PASSENGER, Role.DRIVER);

      // Test passenger
      const passengerReq: any = { user: { id: 'p1', role: Role.PASSENGER } };
      let pNext = false;
      middleware(passengerReq, {} as any, (err?: any) => {
        pNext = true;
        assert.strictEqual(err, undefined);
      });
      assert.strictEqual(pNext, true);

      // Test driver
      const driverReq: any = { user: { id: 'd1', role: Role.DRIVER } };
      let dNext = false;
      middleware(driverReq, {} as any, (err?: any) => {
        dNext = true;
        assert.strictEqual(err, undefined);
      });
      assert.strictEqual(dNext, true);

      // Test unauthorized role (e.g. ADMIN if only passenger/driver allowed)
      const adminReq: any = { user: { id: 'a1', role: Role.ADMIN } };
      let aErr: any = null;
      middleware(adminReq, {} as any, (err?: any) => {
        aErr = err;
      });
      assert.ok(aErr instanceof AppError);
      assert.strictEqual(aErr.statusCode, 403);
    });

    it('should verify helper middleware aliases requirePassenger, requireDriver, requireAdmin, requireRole', () => {
      const passengerReq: any = { user: { id: 'p1', role: Role.PASSENGER } };
      const driverReq: any = { user: { id: 'd1', role: Role.DRIVER } };
      const adminReq: any = { user: { id: 'a1', role: Role.ADMIN } };

      let pAllowed = false;
      requirePassenger(passengerReq, {} as any, (err?: any) => {
        pAllowed = !err;
      });
      assert.strictEqual(pAllowed, true);

      let dAllowed = false;
      requireDriver(driverReq, {} as any, (err?: any) => {
        dAllowed = !err;
      });
      assert.strictEqual(dAllowed, true);

      let aAllowed = false;
      requireAdmin(adminReq, {} as any, (err?: any) => {
        aAllowed = !err;
      });
      assert.strictEqual(aAllowed, true);

      let pDeniedOnDriver = false;
      requireRole(Role.DRIVER)(passengerReq, {} as any, (err?: any) => {
        pDeniedOnDriver = err?.statusCode === 403;
      });
      assert.strictEqual(pDeniedOnDriver, true);
    });
  });

  describe('authenticate middleware', () => {
    it('should reject request with missing Authorization header', async () => {
      const req: any = { headers: {} };
      let caughtError: any = null;

      await authenticate(req, {} as any, (err?: any) => {
        caughtError = err;
      });

      assert.ok(caughtError instanceof AppError);
      assert.strictEqual(caughtError.statusCode, 401);
      assert.strictEqual(caughtError.message, 'Authentication token is required');
    });

    it('should reject request with invalid Authorization format', async () => {
      const req: any = { headers: { authorization: 'Basic dXNlcjpwYXNz' } };
      let caughtError: any = null;

      await authenticate(req, {} as any, (err?: any) => {
        caughtError = err;
      });

      assert.ok(caughtError instanceof AppError);
      assert.strictEqual(caughtError.statusCode, 401);
      assert.strictEqual(
        caughtError.message,
        'Invalid authorization format. Format must be "Bearer <token>"'
      );
    });

    it('should reject request with expired JWT token', async () => {
      const expiredToken = jwt.sign(
        { id: 'user-expired', email: 'exp@uberlite.local', role: Role.PASSENGER },
        config.jwtSecret,
        { expiresIn: '-1s' }
      );

      const req: any = {
        headers: { authorization: `Bearer ${expiredToken}` },
      };
      let caughtError: any = null;

      await authenticate(req, {} as any, (err?: any) => {
        caughtError = err;
      });

      assert.ok(caughtError instanceof AppError);
      assert.strictEqual(caughtError.statusCode, 401);
      assert.strictEqual(caughtError.message, 'Token has expired');
    });

    it('should reject request with malformed or invalid JWT signature', async () => {
      const req: any = {
        headers: { authorization: 'Bearer invalid.token.payload' },
      };
      let caughtError: any = null;

      await authenticate(req, {} as any, (err?: any) => {
        caughtError = err;
      });

      assert.ok(caughtError instanceof AppError);
      assert.strictEqual(caughtError.statusCode, 401);
      assert.strictEqual(caughtError.message, 'Invalid or expired token');
    });

    it('should successfully authenticate valid Bearer token and attach req.user', async () => {
      const validToken = signToken({
        id: 'user-pass-123',
        email: 'passenger123@uberlite.local',
        role: Role.PASSENGER,
      });

      const req: any = {
        headers: { authorization: `Bearer ${validToken}` },
      };
      let nextCalled = false;
      let nextError: any = null;

      await authenticate(req, {} as any, (err?: any) => {
        nextCalled = true;
        nextError = err;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(nextError, undefined);
      assert.ok(req.user);
      assert.strictEqual(req.user.id, 'user-pass-123');
      assert.strictEqual(req.user.email, 'passenger123@uberlite.local');
      assert.strictEqual(req.user.role, Role.PASSENGER);
    });
  });

  describe('Passenger Operations & Role-Protected Endpoints', () => {
    it('getPassengerProfile should return passenger data for authenticated user', async () => {
      const mockPassenger = {
        id: 'pass-id-1',
        email: 'pass1@uberlite.local',
        name: 'Pass User',
        phone: '+919999999991',
        role: Role.PASSENGER,
        createdAt: new Date(),
      };

      const originalFindUnique = prisma.user.findUnique;
      prisma.user.findUnique = (async (args: any) => {
        if (args.where.id === 'pass-id-1') return mockPassenger as any;
        return null;
      }) as any;

      try {
        const req: any = { user: { id: 'pass-id-1', role: Role.PASSENGER } };
        const res = createMockResponse();

        await getPassengerProfile(req, res, (err) => {
          if (err) throw err;
        });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.profile.email, 'pass1@uberlite.local');
      } finally {
        prisma.user.findUnique = originalFindUnique;
      }
    });

    it('getPassengerRides should return ride history for authenticated passenger', async () => {
      const mockRides = [
        {
          id: 'ride-1',
          passengerId: 'pass-id-1',
          driverId: 'driver-id-1',
          pickupAddress: 'Location A',
          dropoffAddress: 'Location B',
          status: 'COMPLETED',
          driver: { id: 'driver-id-1', vehicleModel: 'Swift', rating: 4.8 },
          fare: { totalFare: 250 },
        },
      ];

      const originalFindMany = prisma.ride.findMany;
      prisma.ride.findMany = (async (args: any) => {
        if (args.where.passengerId === 'pass-id-1') return mockRides as any;
        return [];
      }) as any;

      try {
        const req: any = { user: { id: 'pass-id-1', role: Role.PASSENGER } };
        const res = createMockResponse();

        await getPassengerRides(req, res, (err) => {
          if (err) throw err;
        });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.rides.length, 1);
        assert.strictEqual(res.body.data.rides[0].pickupAddress, 'Location A');
      } finally {
        prisma.ride.findMany = originalFindMany;
      }
    });

    it('requestRide should create a ride request for authenticated passenger', async () => {
      const mockRide = {
        id: 'ride-new-1',
        passengerId: 'pass-id-1',
        pickupAddress: 'City Center',
        dropoffAddress: 'Tech Park',
        pickupLat: 28.53,
        pickupLng: 77.39,
        dropoffLat: 28.61,
        dropoffLng: 77.23,
        status: 'REQUESTED',
      };

      const originalCreate = prisma.ride.create;
      prisma.ride.create = (async () => mockRide as any) as any;

      try {
        const req: any = {
          user: { id: 'pass-id-1', role: Role.PASSENGER },
          body: {
            pickupAddress: 'City Center',
            dropoffAddress: 'Tech Park',
            pickupLat: 28.53,
            pickupLng: 77.39,
            dropoffLat: 28.61,
            dropoffLng: 77.23,
          },
        };
        const res = createMockResponse();

        await requestRide(req, res, (err) => {
          if (err) throw err;
        });

        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.ride.status, 'REQUESTED');
      } finally {
        prisma.ride.create = originalCreate;
      }
    });
  });

  describe('Driver Operations & Role-Protected Endpoints', () => {
    it('getDriverProfile should return driver and vehicle details', async () => {
      const mockDriverUser = {
        id: 'driver-u1',
        email: 'driver1@uberlite.local',
        name: 'Dave Driver',
        phone: '+919999999992',
        role: Role.DRIVER,
        driverProfile: {
          id: 'dp-1',
          licenseNumber: 'DL-DRIVER-1',
          vehicleModel: 'Innova',
          vehiclePlate: 'DL-01-A1234',
          isAvailable: true,
          rating: 4.9,
        },
      };

      const originalFindUnique = prisma.user.findUnique;
      prisma.user.findUnique = (async (args: any) => {
        if (args.where.id === 'driver-u1') return mockDriverUser as any;
        return null;
      }) as any;

      try {
        const req: any = { user: { id: 'driver-u1', role: Role.DRIVER } };
        const res = createMockResponse();

        await getDriverProfile(req, res, (err) => {
          if (err) throw err;
        });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.profile.driverProfile.licenseNumber, 'DL-DRIVER-1');
      } finally {
        prisma.user.findUnique = originalFindUnique;
      }
    });

    it('updateAvailability should update driver availability flag', async () => {
      const originalDriverFindUnique = prisma.driver.findUnique;
      const originalDriverUpdate = prisma.driver.update;

      prisma.driver.findUnique = (async (args: any) => {
        if (args.where.userId === 'driver-u1') {
          return { id: 'dp-1', userId: 'driver-u1', isAvailable: false } as any;
        }
        return null;
      }) as any;

      prisma.driver.update = (async (args: any) => {
        return { id: 'dp-1', isAvailable: args.data.isAvailable } as any;
      }) as any;

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
        assert.strictEqual(res.body.data.driver.isAvailable, true);
      } finally {
        prisma.driver.findUnique = originalDriverFindUnique;
        prisma.driver.update = originalDriverUpdate;
      }
    });

    it('getDriverRides should return rides assigned to driver', async () => {
      const originalDriverFindUnique = prisma.driver.findUnique;
      const originalRideFindMany = prisma.ride.findMany;

      prisma.driver.findUnique = (async () => ({ id: 'dp-1', userId: 'driver-u1' }) as any) as any;
      prisma.ride.findMany = (async () => [
        {
          id: 'ride-d1',
          driverId: 'dp-1',
          passengerId: 'p1',
          status: 'ACCEPTED',
          passenger: { id: 'p1', name: 'Passenger User', phone: '+919999999990' },
          fare: null,
        },
      ]) as any;

      try {
        const req: any = { user: { id: 'driver-u1', role: Role.DRIVER } };
        const res = createMockResponse();

        await getDriverRides(req, res, (err) => {
          if (err) throw err;
        });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.rides.length, 1);
        assert.strictEqual(res.body.data.rides[0].status, 'ACCEPTED');
      } finally {
        prisma.driver.findUnique = originalDriverFindUnique;
        prisma.ride.findMany = originalRideFindMany;
      }
    });
  });
});
