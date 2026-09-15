import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { driverService } from '../../services/driver.service';
import {
  getAvailability,
  updateAvailability,
  getDriverLocation,
  updateDriverLocation,
} from '../driver.controller';

function createMockContext(body: unknown, user: any = { id: 'driver-u100', role: 'DRIVER' }) {
  let statusCode = 200;
  let jsonResponse: any = null;
  let nextCalledWith: any = null;

  const req = {
    body,
    user,
  } as any;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      jsonResponse = data;
      return this;
    },
  } as any;

  const next = (err?: any) => {
    nextCalledWith = err;
  };

  return {
    req,
    res,
    next,
    getStatusCode: () => statusCode,
    getJsonResponse: () => jsonResponse,
    getNextCalledWith: () => nextCalledWith,
  };
}

describe('Driver Availability & Location Management', () => {
  const mockDriver = {
    id: 'driver-profile-100',
    userId: 'driver-u100',
    licenseNumber: 'DL-TEST-999',
    vehicleType: 'STANDARD',
    vehicleModel: 'Honda City',
    vehiclePlate: 'DL-99-TEST',
    vehicleColor: 'Black',
    isAvailable: false,
    currentLat: 28.6139,
    currentLng: 77.209,
    rating: 4.9,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('DriverService', () => {
    it('should retrieve driver availability and coordinates', async () => {
      const originalFindUnique = prisma.driver.findUnique;
      prisma.driver.findUnique = (async (args: any) => {
        if (args.where.userId === 'driver-u100') return mockDriver as any;
        return null;
      }) as any;

      try {
        const availability = await driverService.getAvailability('driver-u100');
        assert.equal(availability.driverId, 'driver-profile-100');
        assert.equal(availability.isAvailable, false);
        assert.equal(availability.currentLat, 28.6139);
        assert.equal(availability.currentLng, 77.209);
      } finally {
        prisma.driver.findUnique = originalFindUnique;
      }
    });

    it('should throw 404 AppError when driver profile does not exist', async () => {
      const originalFindUnique = prisma.driver.findUnique;
      prisma.driver.findUnique = (async () => null) as any;

      try {
        await assert.rejects(
          async () => {
            await driverService.getAvailability('unknown-user');
          },
          (err: any) => {
            assert.ok(err instanceof AppError);
            assert.equal(err.statusCode, 404);
            assert.equal(err.message, 'Driver profile not found');
            return true;
          }
        );
      } finally {
        prisma.driver.findUnique = originalFindUnique;
      }
    });

    it('should update availability flag and return updated driver', async () => {
      const originalFindUnique = prisma.driver.findUnique;
      const originalUpdate = prisma.driver.update;

      prisma.driver.findUnique = (async () => mockDriver as any) as any;
      prisma.driver.update = (async (args: any) => ({
        ...mockDriver,
        isAvailable: args.data.isAvailable,
      })) as any;

      try {
        const updated = await driverService.updateAvailability('driver-u100', true);
        assert.equal(updated.isAvailable, true);
      } finally {
        prisma.driver.findUnique = originalFindUnique;
        prisma.driver.update = originalUpdate;
      }
    });

    it('should retrieve driver current location', async () => {
      const originalFindUnique = prisma.driver.findUnique;
      prisma.driver.findUnique = (async () => mockDriver as any) as any;

      try {
        const loc = await driverService.getLocation('driver-u100');
        assert.equal(loc.currentLat, 28.6139);
        assert.equal(loc.currentLng, 77.209);
        assert.equal(loc.isAvailable, false);
      } finally {
        prisma.driver.findUnique = originalFindUnique;
      }
    });

    it('should update driver current coordinates', async () => {
      const originalFindUnique = prisma.driver.findUnique;
      const originalUpdate = prisma.driver.update;

      prisma.driver.findUnique = (async () => mockDriver as any) as any;
      prisma.driver.update = (async (args: any) => ({
        ...mockDriver,
        currentLat: args.data.currentLat,
        currentLng: args.data.currentLng,
      })) as any;

      try {
        const updated = await driverService.updateLocation('driver-u100', 28.6289, 77.2065);
        assert.equal(updated.currentLat, 28.6289);
        assert.equal(updated.currentLng, 77.2065);
      } finally {
        prisma.driver.findUnique = originalFindUnique;
        prisma.driver.update = originalUpdate;
      }
    });

    it('should reject invalid coordinates in updateLocation', async () => {
      await assert.rejects(
        async () => {
          await driverService.updateLocation('driver-u100', 95, 77);
        },
        (err: any) => {
          assert.ok(err instanceof AppError);
          assert.equal(err.statusCode, 400);
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await driverService.updateLocation('driver-u100', 28, 190);
        },
        (err: any) => {
          assert.ok(err instanceof AppError);
          assert.equal(err.statusCode, 400);
          return true;
        }
      );
    });
  });

  describe('Driver Controller Endpoints', () => {
    describe('GET /api/driver/availability', () => {
      it('should return 200 with availability data', async () => {
        const originalFindUnique = prisma.driver.findUnique;
        prisma.driver.findUnique = (async () => mockDriver as any) as any;

        try {
          const ctx = createMockContext({});
          await getAvailability(ctx.req, ctx.res, ctx.next);

          assert.equal(ctx.getStatusCode(), 200);
          const json = ctx.getJsonResponse();
          assert.equal(json.success, true);
          assert.equal(json.data.driverId, 'driver-profile-100');
          assert.equal(json.data.isAvailable, false);
        } finally {
          prisma.driver.findUnique = originalFindUnique;
        }
      });

      it('should pass error to next() if driver is not found', async () => {
        const originalFindUnique = prisma.driver.findUnique;
        prisma.driver.findUnique = (async () => null) as any;

        try {
          const ctx = createMockContext({});
          await getAvailability(ctx.req, ctx.res, ctx.next);

          const err = ctx.getNextCalledWith();
          assert.ok(err instanceof AppError);
          assert.equal(err.statusCode, 404);
        } finally {
          prisma.driver.findUnique = originalFindUnique;
        }
      });
    });

    describe('PATCH /api/driver/availability', () => {
      it('should toggle availability to true and return 200', async () => {
        const originalFindUnique = prisma.driver.findUnique;
        const originalUpdate = prisma.driver.update;

        prisma.driver.findUnique = (async () => mockDriver as any) as any;
        prisma.driver.update = (async (args: any) => ({
          ...mockDriver,
          isAvailable: args.data.isAvailable,
        })) as any;

        try {
          const ctx = createMockContext({ isAvailable: true });
          await updateAvailability(ctx.req, ctx.res, ctx.next);

          assert.equal(ctx.getStatusCode(), 200);
          const json = ctx.getJsonResponse();
          assert.equal(json.success, true);
          assert.equal(json.data.driver.isAvailable, true);
        } finally {
          prisma.driver.findUnique = originalFindUnique;
          prisma.driver.update = originalUpdate;
        }
      });

      it('should pass 400 AppError to next() when isAvailable is not boolean', async () => {
        const ctx = createMockContext({ isAvailable: 'yes' });
        await updateAvailability(ctx.req, ctx.res, ctx.next);

        const err = ctx.getNextCalledWith();
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 400);
      });
    });

    describe('GET /api/driver/location', () => {
      it('should return 200 with driver current coordinates', async () => {
        const originalFindUnique = prisma.driver.findUnique;
        prisma.driver.findUnique = (async () => mockDriver as any) as any;

        try {
          const ctx = createMockContext({});
          await getDriverLocation(ctx.req, ctx.res, ctx.next);

          assert.equal(ctx.getStatusCode(), 200);
          const json = ctx.getJsonResponse();
          assert.equal(json.success, true);
          assert.equal(json.data.currentLat, 28.6139);
          assert.equal(json.data.currentLng, 77.209);
        } finally {
          prisma.driver.findUnique = originalFindUnique;
        }
      });
    });

    describe('PATCH /api/driver/location', () => {
      it('should return 200 and update coordinates with { lat, lng }', async () => {
        const originalFindUnique = prisma.driver.findUnique;
        const originalUpdate = prisma.driver.update;

        prisma.driver.findUnique = (async () => mockDriver as any) as any;
        prisma.driver.update = (async (args: any) => ({
          ...mockDriver,
          currentLat: args.data.currentLat,
          currentLng: args.data.currentLng,
        })) as any;

        try {
          const ctx = createMockContext({ lat: 28.6353, lng: 77.225 });
          await updateDriverLocation(ctx.req, ctx.res, ctx.next);

          assert.equal(ctx.getStatusCode(), 200);
          const json = ctx.getJsonResponse();
          assert.equal(json.success, true);
          assert.equal(json.data.driver.currentLat, 28.6353);
          assert.equal(json.data.driver.currentLng, 77.225);
        } finally {
          prisma.driver.findUnique = originalFindUnique;
          prisma.driver.update = originalUpdate;
        }
      });

      it('should support alternative coordinate keys { latitude, longitude }', async () => {
        const originalFindUnique = prisma.driver.findUnique;
        const originalUpdate = prisma.driver.update;

        prisma.driver.findUnique = (async () => mockDriver as any) as any;
        prisma.driver.update = (async (args: any) => ({
          ...mockDriver,
          currentLat: args.data.currentLat,
          currentLng: args.data.currentLng,
        })) as any;

        try {
          const ctx = createMockContext({ latitude: 28.6353, longitude: 77.225 });
          await updateDriverLocation(ctx.req, ctx.res, ctx.next);

          assert.equal(ctx.getStatusCode(), 200);
          const json = ctx.getJsonResponse();
          assert.equal(json.success, true);
          assert.equal(json.data.driver.currentLat, 28.6353);
          assert.equal(json.data.driver.currentLng, 77.225);
        } finally {
          prisma.driver.findUnique = originalFindUnique;
          prisma.driver.update = originalUpdate;
        }
      });

      it('should pass ZodError to next() on invalid latitude', async () => {
        const ctx = createMockContext({ lat: 95, lng: 77.225 });
        await updateDriverLocation(ctx.req, ctx.res, ctx.next);

        const err = ctx.getNextCalledWith();
        assert.notEqual(err, null);
        assert.equal(err.name, 'ZodError');
      });

      it('should pass ZodError to next() on missing coordinates', async () => {
        const ctx = createMockContext({});
        await updateDriverLocation(ctx.req, ctx.res, ctx.next);

        const err = ctx.getNextCalledWith();
        assert.notEqual(err, null);
        assert.equal(err.name, 'ZodError');
      });
    });
  });
});
