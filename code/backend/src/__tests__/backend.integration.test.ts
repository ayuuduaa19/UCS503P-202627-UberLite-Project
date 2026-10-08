import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Role, RideStatus, VehicleType, PaymentStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { AppError } from '../middleware/errorHandler';
import { register, login } from '../controllers/auth.controller';
import {
  requestRide,
  getPassengerRideHistory,
  matchRideWithDriver,
  submitRideFeedback,
} from '../controllers/passenger.controller';
import {
  acceptRide,
  rejectRide,
  startRide,
  completeRide,
  getDriverRideHistory,
} from '../controllers/driver.controller';

// ─── Helper: Mock Response Object ─────────────────────────────────────────────
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

describe('Task 23: Backend Integration Tests', () => {
  // In-memory mock database state for stateful integration flows
  let mockUsers: any[] = [];
  let mockDrivers: any[] = [];
  let mockRides: any[] = [];
  let mockFares: any[] = [];
  let mockFeedbacks: any[] = [];

  beforeEach(() => {
    mockUsers = [];
    mockDrivers = [];
    mockRides = [];
    mockFares = [];
    mockFeedbacks = [];

    // Transaction mock
    prisma.$transaction = (async (arg: any) => {
      if (typeof arg === 'function') {
        return arg(prisma);
      }
      return Promise.all(arg);
    }) as any;

    // Setup stateful Prisma mocks
    prisma.user.findUnique = (async ({ where, include }: any) => {
      let user: any = null;
      if (where.id) {
        user = mockUsers.find((u) => u.id === where.id) || null;
      } else if (where.email) {
        user = mockUsers.find((u) => u.email.toLowerCase() === where.email.toLowerCase()) || null;
      }

      if (user && include?.driverProfile) {
        const driverProfile = mockDrivers.find((d) => d.userId === user.id) || null;
        return { ...user, driverProfile };
      }
      return user;
    }) as any;

    prisma.user.create = (async ({ data, select }: any) => {
      const newUser: any = {
        id: data.id || `user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        email: data.email,
        password: data.password,
        name: data.name,
        phone: data.phone || null,
        role: data.role || Role.PASSENGER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (data.driverProfile?.create) {
        const driverData = data.driverProfile.create;
        const newDriver = {
          id: `driver-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          userId: newUser.id,
          licenseNumber: driverData.licenseNumber,
          vehicleType: driverData.vehicleType || VehicleType.STANDARD,
          vehicleModel: driverData.vehicleModel,
          vehiclePlate: driverData.vehiclePlate,
          vehicleColor: driverData.vehicleColor || null,
          isAvailable: false,
          currentLat: null,
          currentLng: null,
          rating: 5.0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockDrivers.push(newDriver);
        newUser.driverProfile = newDriver;
      }

      mockUsers.push(newUser);

      if (select) {
        const selected: any = {};
        for (const key of Object.keys(select)) {
          if (select[key]) {
            selected[key] = newUser[key];
          }
        }
        return selected;
      }
      return newUser;
    }) as any;

    prisma.driver.findUnique = (async ({ where, include }: any) => {
      let driver: any = null;
      if (where.id) {
        driver = mockDrivers.find((d) => d.id === where.id) || null;
      } else if (where.userId) {
        driver = mockDrivers.find((d) => d.userId === where.userId) || null;
      } else if (where.licenseNumber) {
        driver = mockDrivers.find((d) => d.licenseNumber === where.licenseNumber) || null;
      } else if (where.vehiclePlate) {
        driver = mockDrivers.find((d) => d.vehiclePlate === where.vehiclePlate) || null;
      }

      if (driver && include?.user) {
        const user = mockUsers.find((u) => u.id === driver.userId);
        return { ...driver, user };
      }
      return driver;
    }) as any;

    prisma.driver.create = (async ({ data }: any) => {
      const newDriver = {
        id: `driver-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        userId: data.userId,
        licenseNumber: data.licenseNumber,
        vehicleType: data.vehicleType || VehicleType.STANDARD,
        vehicleModel: data.vehicleModel,
        vehiclePlate: data.vehiclePlate,
        vehicleColor: data.vehicleColor || null,
        isAvailable: data.isAvailable !== undefined ? data.isAvailable : false,
        currentLat: data.currentLat || null,
        currentLng: data.currentLng || null,
        rating: 5.0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockDrivers.push(newDriver);
      return newDriver;
    }) as any;

    prisma.driver.findMany = (async ({ where, include }: any) => {
      const filtered = mockDrivers.filter((d) => {
        if (where?.isAvailable !== undefined && d.isAvailable !== where.isAvailable) return false;
        if (where?.vehicleType && d.vehicleType !== where.vehicleType) return false;
        return true;
      });

      if (include?.user) {
        return filtered.map((d) => ({
          ...d,
          user: mockUsers.find((u) => u.id === d.userId) || null,
        }));
      }
      return filtered;
    }) as any;

    prisma.driver.update = (async ({ where, data }: any) => {
      const idx = mockDrivers.findIndex((d) => d.id === where.id || d.userId === where.userId);
      if (idx === -1) throw new Error('Driver not found');
      mockDrivers[idx] = { ...mockDrivers[idx], ...data, updatedAt: new Date() };
      return mockDrivers[idx];
    }) as any;

    prisma.ride.create = (async ({ data, include }: any) => {
      const newRide = {
        id: `ride-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        passengerId: data.passengerId,
        driverId: data.driverId || null,
        pickupLat: data.pickupLat,
        pickupLng: data.pickupLng,
        pickupAddress: data.pickupAddress,
        dropoffLat: data.dropoffLat,
        dropoffLng: data.dropoffLng,
        dropoffAddress: data.dropoffAddress,
        distanceKm: data.distanceKm || 0,
        durationMin: data.durationMin || 0,
        status: data.status || RideStatus.REQUESTED,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRides.push(newRide);

      if (include) {
        const passenger = mockUsers.find((u) => u.id === newRide.passengerId);
        const driver = mockDrivers.find((d) => d.id === newRide.driverId);
        return { ...newRide, passenger, driver };
      }
      return newRide;
    }) as any;

    prisma.ride.findUnique = (async ({ where, include }: any) => {
      const ride = mockRides.find((r) => r.id === where.id);
      if (!ride) return null;

      const result: any = { ...ride };
      if (include?.passenger) {
        result.passenger = mockUsers.find((u) => u.id === ride.passengerId);
      }
      if (include?.driver) {
        const driver = mockDrivers.find((d) => d.id === ride.driverId);
        if (driver && include.driver.include?.user) {
          const user = mockUsers.find((u) => u.id === driver.userId);
          result.driver = { ...driver, user };
        } else {
          result.driver = driver || null;
        }
      }
      if (include?.fare) {
        result.fare = mockFares.find((f) => f.rideId === ride.id) || null;
      }
      if (include?.feedbacks) {
        result.feedbacks = mockFeedbacks.filter((fb) => fb.rideId === ride.id);
      }
      return result;
    }) as any;

    prisma.ride.findMany = (async ({ where, include, orderBy }: any) => {
      let filtered = mockRides.filter((r) => {
        if (where?.passengerId && r.passengerId !== where.passengerId) return false;
        if (where?.driverId && r.driverId !== where.driverId) return false;
        if (where?.status && r.status !== where.status) return false;
        return true;
      });

      if (orderBy?.createdAt === 'desc') {
        filtered = filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }

      return filtered.map((ride) => {
        const result: any = { ...ride };
        if (include?.passenger) {
          result.passenger = mockUsers.find((u) => u.id === ride.passengerId);
        }
        if (include?.driver) {
          const driver = mockDrivers.find((d) => d.id === ride.driverId);
          if (driver && include.driver.include?.user) {
            const user = mockUsers.find((u) => u.id === driver.userId);
            result.driver = { ...driver, user };
          } else {
            result.driver = driver || null;
          }
        }
        if (include?.fare) {
          result.fare = mockFares.find((f) => f.rideId === ride.id) || null;
        }
        if (include?.feedbacks) {
          result.feedbacks = mockFeedbacks.filter((fb) => fb.rideId === ride.id);
        }
        return result;
      });
    }) as any;

    prisma.ride.update = (async ({ where, data, include }: any) => {
      const idx = mockRides.findIndex((r) => r.id === where.id);
      if (idx === -1) throw new Error('Ride not found');
      mockRides[idx] = { ...mockRides[idx], ...data, updatedAt: new Date() };
      const updated = mockRides[idx];

      if (include) {
        const passenger = mockUsers.find((u) => u.id === updated.passengerId);
        const driver = mockDrivers.find((d) => d.id === updated.driverId);
        return {
          ...updated,
          passenger,
          driver: driver ? { ...driver, user: mockUsers.find((u) => u.id === driver.userId) } : null,
          fare: mockFares.find((f) => f.rideId === updated.id) || null,
        };
      }
      return updated;
    }) as any;

    prisma.fare.create = (async ({ data }: any) => {
      const newFare = {
        id: `fare-${Date.now()}`,
        rideId: data.rideId,
        baseFare: data.baseFare,
        distanceFare: data.distanceFare,
        timeFare: data.timeFare,
        surgeMultiplier: data.surgeMultiplier || 1.0,
        totalFare: data.totalFare,
        currency: data.currency || 'INR',
        paymentStatus: data.paymentStatus || PaymentStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockFares.push(newFare);
      return newFare;
    }) as any;

    prisma.fare.findUnique = (async ({ where }: any) => {
      return mockFares.find((f) => f.rideId === where.rideId || f.id === where.id) || null;
    }) as any;

    prisma.feedback.create = (async ({ data }: any) => {
      const newFeedback = {
        id: `feedback-${Date.now()}`,
        rideId: data.rideId,
        userId: data.userId,
        rating: data.rating,
        comment: data.comment || null,
        createdAt: new Date(),
      };
      mockFeedbacks.push(newFeedback);
      return newFeedback;
    }) as any;

    prisma.feedback.findFirst = (async ({ where }: any) => {
      return mockFeedbacks.find((fb) => fb.rideId === where.rideId && fb.userId === where.userId) || null;
    }) as any;

    prisma.feedback.findMany = (async ({ where }: any) => {
      if (where?.rideId) {
        return mockFeedbacks.filter((fb) => fb.rideId === where.rideId);
      }
      if (where?.ride?.driverId) {
        const driverRideIds = mockRides.filter((r) => r.driverId === where.ride.driverId).map((r) => r.id);
        return mockFeedbacks.filter((fb) => driverRideIds.includes(fb.rideId));
      }
      return mockFeedbacks;
    }) as any;
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 1. Registration and Login Integration Tests
  // ═════════════════════════════════════════════════════════════════════════
  describe('1. User Registration & Login Integration', () => {
    it('should register a passenger, hash the password, and authenticate successfully', async () => {
      const passengerPayload = {
        email: 'passenger.integration@uberlite.com',
        password: 'Password123!',
        name: 'Alice Passenger',
        phone: '+919876543210',
        role: 'PASSENGER',
      };

      const req: any = { body: passengerPayload };
      const res = createMockResponse();

      await register(req, res, () => {});

      assert.equal(res.statusCode, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.user.email, 'passenger.integration@uberlite.com');
      assert.equal(res.body.data.user.role, Role.PASSENGER);

      // Verify password hashed in database
      const savedUser = mockUsers.find((u) => u.email === 'passenger.integration@uberlite.com');
      assert.ok(savedUser);
      assert.notEqual(savedUser.password, 'Password123!');
      const passwordMatches = await bcrypt.compare('Password123!', savedUser.password);
      assert.equal(passwordMatches, true);

      // Verify login with correct credentials
      const loginReq: any = {
        body: {
          email: 'passenger.integration@uberlite.com',
          password: 'Password123!',
        },
      };
      const loginRes = createMockResponse();

      await login(loginReq, loginRes, () => {});

      assert.equal(loginRes.statusCode, 200);
      assert.equal(loginRes.body.success, true);
      assert.equal(loginRes.body.data.user.email, 'passenger.integration@uberlite.com');
      assert.ok(loginRes.body.data.token);
    });

    it('should register a driver with driver profile and vehicle details', async () => {
      const driverPayload = {
        email: 'driver.integration@uberlite.com',
        password: 'SecureDriverPass123!',
        name: 'Bob Driver',
        phone: '+919123456789',
        role: 'DRIVER',
        licenseNumber: 'DL-IND-2026-999',
        vehicleType: 'STANDARD',
        vehicleModel: 'Hyundai Aura',
        vehiclePlate: 'DL-01-AB-1234',
        vehicleColor: 'Silver',
      };

      const req: any = { body: driverPayload };
      const res = createMockResponse();

      await register(req, res, () => {});

      assert.equal(res.statusCode, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.user.role, Role.DRIVER);

      const savedDriver = mockDrivers.find((d) => d.licenseNumber === 'DL-IND-2026-999');
      assert.ok(savedDriver);
      assert.equal(savedDriver.vehiclePlate, 'DL-01-AB-1234');
      assert.equal(savedDriver.isAvailable, false);
      assert.equal(savedDriver.rating, 5.0);

      // Verify driver login returns user and token
      const loginReq: any = {
        body: {
          email: 'driver.integration@uberlite.com',
          password: 'SecureDriverPass123!',
        },
      };
      const loginRes = createMockResponse();

      await login(loginReq, loginRes, () => {});

      assert.equal(loginRes.statusCode, 200);
      assert.equal(loginRes.body.success, true);
      assert.equal(loginRes.body.data.user.role, Role.DRIVER);
      assert.ok(loginRes.body.data.token);
    });

    it('should prevent duplicate user registration with 409 conflict', async () => {
      const payload = {
        email: 'duplicate@uberlite.com',
        password: 'Password123!',
        name: 'Duplicate User',
        role: 'PASSENGER',
      };

      const req1: any = { body: payload };
      const res1 = createMockResponse();
      await register(req1, res1, () => {});
      assert.equal(res1.statusCode, 201);

      const req2: any = { body: payload };
      const res2 = createMockResponse();
      let errorThrown: any = null;

      await register(req2, res2, (err: any) => {
        errorThrown = err;
      });

      assert.ok(errorThrown instanceof AppError);
      assert.equal(errorThrown.statusCode, 409);
      assert.match(errorThrown.message, /already exists/i);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 2. Authenticated Role Access Integration Tests
  // ═════════════════════════════════════════════════════════════════════════
  describe('2. Authenticated Role Access & Authorization Guards Integration', () => {
    it('should reject unauthenticated requests with 401 Unauthorized', async () => {
      const req: any = { headers: {} };
      const res = createMockResponse();
      let authError: any = null;

      authenticate(req, res, (err: any) => {
        authError = err;
      });

      assert.ok(authError instanceof AppError);
      assert.equal(authError.statusCode, 401);
      assert.match(authError.message, /Authentication token is required/i);
    });

    it('should reject passenger accessing driver-restricted endpoints with 403 Forbidden', async () => {
      const passengerUser = {
        id: 'user-pass-1',
        userId: 'user-pass-1',
        email: 'passenger@uberlite.com',
        role: Role.PASSENGER,
      };

      const req: any = { user: passengerUser };
      const res = createMockResponse();
      let authzError: any = null;

      const driverGuard = authorize(Role.DRIVER);
      driverGuard(req, res, (err: any) => {
        authzError = err;
      });

      assert.ok(authzError instanceof AppError);
      assert.equal(authzError.statusCode, 403);
      assert.match(authzError.message, /permission|forbidden/i);
    });

    it('should reject driver accessing passenger-restricted endpoints with 403 Forbidden', async () => {
      const driverUser = {
        id: 'user-drv-1',
        userId: 'user-drv-1',
        email: 'driver@uberlite.com',
        role: Role.DRIVER,
      };

      const req: any = { user: driverUser };
      const res = createMockResponse();
      let authzError: any = null;

      const passengerGuard = authorize(Role.PASSENGER);
      passengerGuard(req, res, (err: any) => {
        authzError = err;
      });

      assert.ok(authzError instanceof AppError);
      assert.equal(authzError.statusCode, 403);
      assert.match(authzError.message, /permission|forbidden/i);
    });

    it('should allow valid passenger and driver tokens to access authorized endpoints', async () => {
      await prisma.user.create({
        data: {
          id: 'user-pass-1',
          email: 'passenger@uberlite.com',
          password: 'Password123!',
          name: 'Passenger',
          role: Role.PASSENGER,
        },
      });

      const passengerToken = jwt.sign(
        { id: 'user-pass-1', userId: 'user-pass-1', email: 'passenger@uberlite.com', role: Role.PASSENGER },
        config.jwtSecret,
      );

      const req: any = {
        headers: { authorization: `Bearer ${passengerToken}` },
      };
      const res = createMockResponse();
      let nextCalled = false;

      await authenticate(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(req.user.id, 'user-pass-1');
      assert.equal(req.user.role, Role.PASSENGER);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 3. Complete Ride Lifecycle Integration: Creation, Matching, Progression, Completion, Fare & Feedback
  // ═════════════════════════════════════════════════════════════════════════
  describe('3. Complete End-to-End Ride Lifecycle Integration', () => {
    let passenger: any;
    let driver: any;
    let createdRide: any;

    beforeEach(async () => {
      // 1. Create Passenger
      passenger = await prisma.user.create({
        data: {
          email: 'alice.lifecycle@uberlite.com',
          password: 'Password123!',
          name: 'Alice Lifecycle',
          role: Role.PASSENGER,
        },
      });

      // 2. Create Driver & Driver Profile
      const driverUser = await prisma.user.create({
        data: {
          email: 'bob.lifecycle@uberlite.com',
          password: 'Password123!',
          name: 'Bob Lifecycle',
          role: Role.DRIVER,
        },
      });

      driver = await prisma.driver.create({
        data: {
          userId: driverUser.id,
          licenseNumber: 'DL-LC-2026-101',
          vehicleType: VehicleType.STANDARD,
          vehicleModel: 'Honda City',
          vehiclePlate: 'DL-09-XY-9876',
          isAvailable: true,
          currentLat: 28.614, // Near Connaught Place
          currentLng: 77.210,
        },
      });
    });

    it('should complete full ride lifecycle from creation to matching, progression, completion, fare, and feedback', async () => {
      // Step A: Passenger creates a ride request
      const ridePayload = {
        pickupAddress: 'Connaught Place, New Delhi',
        pickupLat: 28.6139,
        pickupLng: 77.209,
        dropoffAddress: 'Cyber City, Gurugram',
        dropoffLat: 28.4955,
        dropoffLng: 77.089,
        distanceKm: 20.0,
        durationMin: 35.0,
      };

      const createRideReq: any = {
        user: { id: passenger.id, userId: passenger.id, email: passenger.email, role: Role.PASSENGER },
        body: ridePayload,
      };
      const createRideRes = createMockResponse();

      await requestRide(createRideReq, createRideRes, () => {});

      assert.equal(createRideRes.statusCode, 201);
      assert.equal(createRideRes.body.success, true);
      createdRide = createRideRes.body.data.ride;
      assert.equal(createdRide.passengerId, passenger.id);
      assert.equal(createdRide.pickupAddress, 'Connaught Place, New Delhi');

      // Step B: Match or auto-matched
      if (createdRide.status === RideStatus.REQUESTED) {
        const matchReq: any = {
          user: { id: passenger.id, userId: passenger.id, email: passenger.email, role: Role.PASSENGER },
          params: { id: createdRide.id },
        };
        const matchRes = createMockResponse();
        await matchRideWithDriver(matchReq, matchRes, () => {});
        assert.equal(matchRes.statusCode, 200);
        assert.equal(matchRes.body.success, true);
        assert.equal(matchRes.body.data.ride.status, RideStatus.MATCHED);
      } else {
        assert.equal(createdRide.status, RideStatus.MATCHED);
      }

      // Step C: Driver accepts the assigned ride
      const acceptReq: any = {
        user: { id: driver.userId, userId: driver.userId, email: 'bob.lifecycle@uberlite.com', role: Role.DRIVER },
        params: { id: createdRide.id },
      };
      const acceptRes = createMockResponse();

      await acceptRide(acceptReq, acceptRes, () => {});

      assert.equal(acceptRes.statusCode, 200);
      assert.equal(acceptRes.body.success, true);
      assert.equal(acceptRes.body.data.ride.status, RideStatus.ACCEPTED);

      // Verify driver is marked unavailable while on trip
      const updatedDriver = await prisma.driver.findUnique({ where: { id: driver.id } });
      assert.equal(updatedDriver.isAvailable, false);

      // Step D: Driver starts the ride (IN_PROGRESS)
      const startReq: any = {
        user: { id: driver.userId, userId: driver.userId, email: 'bob.lifecycle@uberlite.com', role: Role.DRIVER },
        params: { id: createdRide.id },
      };
      const startRes = createMockResponse();

      await startRide(startReq, startRes, () => {});

      assert.equal(startRes.statusCode, 200);
      assert.equal(startRes.body.success, true);
      assert.equal(startRes.body.data.ride.status, RideStatus.IN_PROGRESS);

      // Step E: Driver completes the ride and generates fare
      const completeReq: any = {
        user: { id: driver.userId, userId: driver.userId, email: 'bob.lifecycle@uberlite.com', role: Role.DRIVER },
        params: { id: createdRide.id },
        body: { distanceKm: 20.0, durationMin: 35.0 },
      };
      const completeRes = createMockResponse();

      await completeRide(completeReq, completeRes, () => {});

      assert.equal(completeRes.statusCode, 200);
      assert.equal(completeRes.body.success, true);
      assert.equal(completeRes.body.data.ride.status, RideStatus.COMPLETED);

      // Verify fare calculation
      // STANDARD Vehicle: baseFare = 30, ratePerKm = 12 * 20 km = 240, timeFare = 0, totalFare = 270
      const savedFare = await prisma.fare.findUnique({ where: { rideId: createdRide.id } });
      assert.ok(savedFare);
      assert.equal(savedFare.baseFare, 30);
      assert.equal(savedFare.distanceFare, 240);
      assert.equal(savedFare.totalFare, 270);
      assert.equal(savedFare.paymentStatus, PaymentStatus.PENDING);

      // Verify driver availability is restored upon ride completion
      const restoredDriver = await prisma.driver.findUnique({ where: { id: driver.id } });
      assert.equal(restoredDriver.isAvailable, true);

      // Step F: Passenger submits feedback and 5-star rating
      const feedbackReq: any = {
        user: { id: passenger.id, userId: passenger.id, email: passenger.email, role: Role.PASSENGER },
        params: { id: createdRide.id },
        body: { rating: 5, comment: 'Punctual driver, very smooth ride!' },
      };
      const feedbackRes = createMockResponse();

      await submitRideFeedback(feedbackReq, feedbackRes, () => {});

      assert.equal(feedbackRes.statusCode, 201);
      assert.equal(feedbackRes.body.success, true);
      assert.equal(feedbackRes.body.data.feedback.rating, 5);
      assert.equal(feedbackRes.body.data.feedback.comment, 'Punctual driver, very smooth ride!');
    });

    it('should handle driver rejection workflow gracefully', async () => {
      // 1. Create Ride
      const ride = await prisma.ride.create({
        data: {
          passengerId: passenger.id,
          pickupAddress: 'Noida Sector 18',
          pickupLat: 28.57,
          pickupLng: 77.32,
          dropoffAddress: 'Indira Gandhi International Airport',
          dropoffLat: 28.55,
          dropoffLng: 77.10,
          distanceKm: 25.0,
          durationMin: 45.0,
          status: RideStatus.MATCHED,
          driverId: driver.id,
        },
      });

      // 2. Driver rejects the ride
      const rejectReq: any = {
        user: { id: driver.userId, userId: driver.userId, email: 'bob.lifecycle@uberlite.com', role: Role.DRIVER },
        params: { id: ride.id },
      };
      const rejectRes = createMockResponse();

      await rejectRide(rejectReq, rejectRes, () => {});

      assert.equal(rejectRes.statusCode, 200);
      assert.equal(rejectRes.body.success, true);
      assert.equal(rejectRes.body.data.ride.status, RideStatus.REQUESTED);
      assert.equal(rejectRes.body.data.ride.driverId, null);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 4. Ride History & Feedback Constraints Integration Tests
  // ═════════════════════════════════════════════════════════════════════════
  describe('4. Ride History & Feedback Constraints Integration', () => {
    let testPassenger: any;
    let testDriver: any;
    let completedRide: any;

    beforeEach(async () => {
      testPassenger = await prisma.user.create({
        data: {
          email: 'history.passenger@uberlite.com',
          password: 'Password123!',
          name: 'History Passenger',
          role: Role.PASSENGER,
        },
      });

      const driverUser = await prisma.user.create({
        data: {
          email: 'history.driver@uberlite.com',
          password: 'Password123!',
          name: 'History Driver',
          role: Role.DRIVER,
        },
      });

      testDriver = await prisma.driver.create({
        data: {
          userId: driverUser.id,
          licenseNumber: 'DL-HIST-2026-888',
          vehicleType: VehicleType.PREMIUM,
          vehicleModel: 'Toyota Camry',
          vehiclePlate: 'DL-04-AB-4321',
          isAvailable: true,
          rating: 4.8,
        },
      });

      completedRide = await prisma.ride.create({
        data: {
          passengerId: testPassenger.id,
          driverId: testDriver.id,
          pickupAddress: 'Saket, New Delhi',
          pickupLat: 28.5244,
          pickupLng: 77.2173,
          dropoffAddress: 'Cyber Hub, Gurugram',
          dropoffLat: 28.4986,
          dropoffLng: 77.0878,
          distanceKm: 18.0,
          durationMin: 30.0,
          status: RideStatus.COMPLETED,
        },
      });

      await prisma.fare.create({
        data: {
          rideId: completedRide.id,
          baseFare: 60,
          distanceFare: 360,
          timeFare: 0,
          surgeMultiplier: 1.0,
          totalFare: 420,
          currency: 'INR',
          paymentStatus: PaymentStatus.COMPLETED,
        },
      });
    });

    it('should retrieve passenger ride history with fares, status, and driver details', async () => {
      const req: any = {
        user: { id: testPassenger.id, userId: testPassenger.id, email: testPassenger.email, role: Role.PASSENGER },
        query: { status: 'COMPLETED' },
      };
      const res = createMockResponse();

      await getPassengerRideHistory(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data.rides));
      assert.equal(res.body.data.rides.length, 1);
      assert.equal(res.body.data.rides[0].id, completedRide.id);
      assert.equal(res.body.data.rides[0].status, RideStatus.COMPLETED);
      assert.ok(res.body.data.rides[0].fare);
      assert.equal(res.body.data.rides[0].fare.totalFare, 420);
    });

    it('should retrieve driver ride history with fares and passenger info', async () => {
      const req: any = {
        user: { id: testDriver.userId, userId: testDriver.userId, email: 'history.driver@uberlite.com', role: Role.DRIVER },
        query: {},
      };
      const res = createMockResponse();

      await getDriverRideHistory(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data.rides));
      assert.equal(res.body.data.rides.length, 1);
      assert.equal(res.body.data.rides[0].id, completedRide.id);
      assert.equal(res.body.data.rides[0].fare.totalFare, 420);
    });

    it('should reject duplicate feedback submission with 409 conflict', async () => {
      // 1. Submit first feedback
      const req1: any = {
        user: { id: testPassenger.id, userId: testPassenger.id, email: testPassenger.email, role: Role.PASSENGER },
        params: { id: completedRide.id },
        body: { rating: 5, comment: 'Excellent!' },
      };
      const res1 = createMockResponse();
      await submitRideFeedback(req1, res1, () => {});
      assert.equal(res1.statusCode, 201);

      // 2. Submit second feedback on same ride -> Conflict
      const req2: any = {
        user: { id: testPassenger.id, userId: testPassenger.id, email: testPassenger.email, role: Role.PASSENGER },
        params: { id: completedRide.id },
        body: { rating: 4, comment: 'Updating review' },
      };
      const res2 = createMockResponse();
      let conflictErr: any = null;

      await submitRideFeedback(req2, res2, (err: any) => {
        conflictErr = err;
      });

      assert.ok(conflictErr instanceof AppError);
      assert.equal(conflictErr.statusCode, 409);
      assert.match(conflictErr.message, /already been submitted/i);
    });

    it('should prevent submitting feedback on non-completed rides', async () => {
      const inProgressRide = await prisma.ride.create({
        data: {
          passengerId: testPassenger.id,
          driverId: testDriver.id,
          pickupAddress: 'Saket',
          pickupLat: 28.52,
          pickupLng: 77.21,
          dropoffAddress: 'Cyber Hub',
          dropoffLat: 28.49,
          dropoffLng: 77.08,
          status: RideStatus.IN_PROGRESS,
        },
      });

      const req: any = {
        user: { id: testPassenger.id, userId: testPassenger.id, email: testPassenger.email, role: Role.PASSENGER },
        params: { id: inProgressRide.id },
        body: { rating: 5, comment: 'Trip is still running' },
      };
      const res = createMockResponse();
      let errPassed: any = null;

      await submitRideFeedback(req, res, (err: any) => {
        errPassed = err;
      });

      assert.ok(errPassed instanceof AppError);
      assert.equal(errPassed.statusCode, 400);
      assert.match(errPassed.message, /only be submitted for completed rides/i);
    });
  });
});
