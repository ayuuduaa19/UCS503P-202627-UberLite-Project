import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { loginSchema } from '../validators/auth.validator';
import { AuthService } from '../services/auth.service';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { AppError } from '../middleware/errorHandler';
import { login } from '../controllers/auth.controller';
import { Role } from '@prisma/client';

describe('Login API & Authentication', () => {
  const authService = new AuthService();

  describe('Zod Validation - loginSchema', () => {
    it('should validate and normalize valid login input', () => {
      const result = loginSchema.safeParse({
        email: '  TEST.User@UberLite.LOCAL  ',
        password: 'Password123!',
      });

      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data.email, 'test.user@uberlite.local');
        assert.strictEqual(result.data.password, 'Password123!');
      }
    });

    it('should reject invalid email format', () => {
      const result = loginSchema.safeParse({
        email: 'invalid-email-format',
        password: 'password123',
      });

      assert.strictEqual(result.success, false);
      if (!result.success) {
        const emailError = result.error.issues.find((i) => i.path.includes('email'));
        assert.ok(emailError, 'Expected validation error on email');
        assert.strictEqual(emailError?.message, 'Invalid email address');
      }
    });

    it('should reject empty password', () => {
      const result = loginSchema.safeParse({
        email: 'test@uberlite.local',
        password: '',
      });

      assert.strictEqual(result.success, false);
      if (!result.success) {
        const passError = result.error.issues.find((i) => i.path.includes('password'));
        assert.ok(passError, 'Expected validation error on password');
      }
    });
  });

  describe('AuthService.login', () => {
    const rawPassword = 'SecurePassword123!';
    let hashedPassword: string;

    beforeEach(async () => {
      hashedPassword = await bcrypt.hash(rawPassword, 10);
    });

    it('should successfully log in passenger, verify credentials, and return JWT containing identity & role', async () => {
      const mockPassengerUser = {
        id: 'user-uuid-101',
        email: 'passenger@uberlite.local',
        password: hashedPassword,
        name: 'Jane Passenger',
        phone: '+919876543210',
        role: Role.PASSENGER,
        driverProfile: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock prisma.user.findUnique
      const originalFindUnique = prisma.user.findUnique;
      prisma.user.findUnique = (async (args: any) => {
        if (args.where.email === 'passenger@uberlite.local') {
          return mockPassengerUser as any;
        }
        return null;
      }) as any;

      try {
        const result = await authService.login({
          email: 'passenger@uberlite.local',
          password: rawPassword,
        });

        // 1. Verify token exists
        assert.ok(result.token, 'Token should be returned');

        // 2. Verify token payload contains user identity and role
        const decoded = jwt.verify(result.token, config.jwtSecret) as any;
        assert.strictEqual(decoded.id, 'user-uuid-101');
        assert.strictEqual(decoded.userId, 'user-uuid-101');
        assert.strictEqual(decoded.email, 'passenger@uberlite.local');
        assert.strictEqual(decoded.role, 'PASSENGER');

        // 3. Verify user profile returned without password
        assert.strictEqual(result.user.id, 'user-uuid-101');
        assert.strictEqual(result.user.email, 'passenger@uberlite.local');
        assert.strictEqual(result.user.name, 'Jane Passenger');
        assert.strictEqual(result.user.role, 'PASSENGER');
        assert.strictEqual((result.user as any).password, undefined, 'Password must not be returned');
      } finally {
        prisma.user.findUnique = originalFindUnique;
      }
    });

    it('should successfully log in driver and return JWT with DRIVER role and driver profile', async () => {
      const mockDriverUser = {
        id: 'user-uuid-202',
        email: 'driver@uberlite.local',
        password: hashedPassword,
        name: 'John Driver',
        phone: '+919876543220',
        role: Role.DRIVER,
        driverProfile: {
          id: 'driver-uuid-202',
          userId: 'user-uuid-202',
          licenseNumber: 'DL-01-2026',
          vehicleType: 'STANDARD',
          vehicleModel: 'Honda City',
          vehiclePlate: 'DL-1C-5678',
          vehicleColor: 'White',
          isAvailable: true,
          currentLat: 28.61,
          currentLng: 77.23,
          rating: 4.9,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const originalFindUnique = prisma.user.findUnique;
      prisma.user.findUnique = (async (args: any) => {
        if (args.where.email === 'driver@uberlite.local') {
          return mockDriverUser as any;
        }
        return null;
      }) as any;

      try {
        const result = await authService.login({
          email: 'driver@uberlite.local',
          password: rawPassword,
        });

        assert.ok(result.token, 'Token should be returned');
        const decoded = jwt.verify(result.token, config.jwtSecret) as any;
        assert.strictEqual(decoded.id, 'user-uuid-202');
        assert.strictEqual(decoded.userId, 'user-uuid-202');
        assert.strictEqual(decoded.email, 'driver@uberlite.local');
        assert.strictEqual(decoded.role, 'DRIVER');

        assert.strictEqual(result.user.role, 'DRIVER');
        assert.ok(result.user.driverProfile);
        assert.strictEqual(result.user.driverProfile.vehiclePlate, 'DL-1C-5678');
      } finally {
        prisma.user.findUnique = originalFindUnique;
      }
    });

    it('should throw 401 AppError when email is not registered', async () => {
      const originalFindUnique = prisma.user.findUnique;
      prisma.user.findUnique = (async () => null) as any;

      try {
        await assert.rejects(
          async () => {
            await authService.login({
              email: 'unknown@uberlite.local',
              password: rawPassword,
            });
          },
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.strictEqual(err.statusCode, 401);
            assert.strictEqual(err.message, 'Invalid email or password');
            return true;
          }
        );
      } finally {
        prisma.user.findUnique = originalFindUnique;
      }
    });

    it('should throw 401 AppError when password is incorrect', async () => {
      const mockUser = {
        id: 'user-uuid-303',
        email: 'bob@uberlite.local',
        password: hashedPassword,
        name: 'Bob Smith',
        phone: null,
        role: Role.PASSENGER,
        driverProfile: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const originalFindUnique = prisma.user.findUnique;
      prisma.user.findUnique = (async () => mockUser as any) as any;

      try {
        await assert.rejects(
          async () => {
            await authService.login({
              email: 'bob@uberlite.local',
              password: 'WrongPassword!',
            });
          },
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.strictEqual(err.statusCode, 401);
            assert.strictEqual(err.message, 'Invalid email or password');
            return true;
          }
        );
      } finally {
        prisma.user.findUnique = originalFindUnique;
      }
    });
  });

  describe('Auth Controller - login handler', () => {
    it('should return 200 with token and user on valid login', async () => {
      const hashedPassword = await bcrypt.hash('secret123', 10);
      const mockUser = {
        id: 'user-1',
        email: 'ctrl@uberlite.local',
        password: hashedPassword,
        name: 'Controller User',
        phone: null,
        role: Role.PASSENGER,
        driverProfile: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const originalFindUnique = prisma.user.findUnique;
      prisma.user.findUnique = (async () => mockUser as any) as any;

      try {
        const req: any = {
          body: {
            email: 'ctrl@uberlite.local',
            password: 'secret123',
          },
        };

        let responseStatus = 0;
        let responseJson: any = null;

        const res: any = {
          status: (code: number) => {
            responseStatus = code;
            return res;
          },
          json: (data: any) => {
            responseJson = data;
            return res;
          },
        };

        let nextCalled = false;
        const next = (err?: any) => {
          nextCalled = true;
          if (err) throw err;
        };

        await login(req, res, next);

        assert.strictEqual(responseStatus, 200);
        assert.strictEqual(responseJson.success, true);
        assert.strictEqual(responseJson.message, 'Login successful');
        assert.ok(responseJson.data.token);
        assert.strictEqual(responseJson.data.user.email, 'ctrl@uberlite.local');
        assert.strictEqual(nextCalled, false);
      } finally {
        prisma.user.findUnique = originalFindUnique;
      }
    });

    it('should forward validation error to next() on invalid body', async () => {
      const req: any = {
        body: {
          email: 'not-an-email',
          password: '',
        },
      };

      const res: any = {};
      let caughtError: any = null;
      const next = (err?: any) => {
        caughtError = err;
      };

      await login(req, res, next);
      assert.ok(caughtError, 'Expected next() to be called with error');
      assert.strictEqual(caughtError.name, 'ZodError');
    });
  });
});
