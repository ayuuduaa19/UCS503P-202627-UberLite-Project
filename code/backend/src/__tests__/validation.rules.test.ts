import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ZodError } from 'zod';
import { Role, RideStatus, VehicleType } from '@prisma/client';
import {
  registerSchema,
  loginSchema,
} from '../validators/auth.validator';
import {
  updateAvailabilitySchema,
  updateLocationSchema,
  updateDriverStatusSchema,
} from '../validators/driver.validator';
import {
  createRideSchema,
} from '../validators/ride.validator';
import {
  estimateFareFromLocationsSchema,
  completeRideFareSchema,
} from '../validators/fare.validator';
import {
  createFeedbackSchema,
  rideHistoryQuerySchema,
} from '../validators/feedback.validator';
import {
  calculateDistanceSchema,
  estimateRideSchema,
} from '../validators/location.validator';
import {
  matchingOptionsSchema,
  findNearbyDriversSchema,
  assignDriverSchema,
} from '../validators/matching.validator';
import {
  idParamSchema,
  coordinatesSchema,
  rideFilterQuerySchema,
} from '../validators/common.validator';
import {
  validateBody,
  validateQuery,
  validateParams,
  validateRequest,
} from '../middleware/validate';

describe('Task 21 & 22: Backend Validation Rules Unit Tests', () => {
  // ─── Authentication Validation Rules ──────────────────────────────────────
  describe('Authentication Validation (registerSchema & loginSchema)', () => {
    it('should validate valid passenger registration', () => {
      const input = {
        name: 'Jane Doe',
        email: 'JANE@example.com',
        password: 'password123',
        role: 'PASSENGER',
      };
      const result = registerSchema.parse(input);
      assert.equal(result.name, 'Jane Doe');
      assert.equal(result.email, 'jane@example.com'); // normalized to lowercase
      assert.equal(result.role, 'PASSENGER');
    });

    it('should validate valid driver registration with required driver fields', () => {
      const input = {
        name: 'John Driver',
        email: 'john@example.com',
        password: 'securePassword1',
        role: 'DRIVER',
        licenseNumber: 'DL-987654321',
        vehicleType: 'STANDARD',
        vehicleModel: 'Honda City',
        vehiclePlate: 'DL-01-AB-1234',
        vehicleColor: 'Silver',
      };
      const result = registerSchema.parse(input);
      assert.equal(result.role, 'DRIVER');
      assert.equal(result.licenseNumber, 'DL-987654321');
      assert.equal(result.vehicleModel, 'Honda City');
    });

    it('should reject driver registration when vehicle fields are missing', () => {
      const input = {
        name: 'Incomplete Driver',
        email: 'inc@example.com',
        password: 'password123',
        role: 'DRIVER',
      };
      assert.throws(() => registerSchema.parse(input), (err: any) => {
        assert.ok(err instanceof ZodError);
        const issues = err.issues.map((i: any) => i.message);
        assert.ok(issues.includes('License number is required for driver registration'));
        assert.ok(issues.includes('Vehicle model is required for driver registration'));
        assert.ok(issues.includes('Vehicle plate is required for driver registration'));
        return true;
      });
    });

    it('should reject invalid email format and short password in registration', () => {
      assert.throws(() => registerSchema.parse({
        name: 'Test',
        email: 'not-an-email',
        password: '123',
      }), (err: any) => {
        assert.ok(err instanceof ZodError);
        assert.ok(err.issues.some((i: any) => i.path.includes('email')));
        assert.ok(err.issues.some((i: any) => i.path.includes('password')));
        return true;
      });
    });

    it('should validate valid login input and reject missing email or password', () => {
      const valid = loginSchema.parse({
        email: 'user@example.com',
        password: 'myPassword',
      });
      assert.equal(valid.email, 'user@example.com');

      assert.throws(() => loginSchema.parse({ email: 'user@example.com' }), /Password is required/);
      assert.throws(() => loginSchema.parse({ password: 'secret' }), /Email is required/);
      assert.throws(() => loginSchema.parse({ email: 'bad-email', password: 'secret' }), /Invalid email address/);
    });
  });

  // ─── Driver Validation Rules ──────────────────────────────────────────────
  describe('Driver Validation (updateAvailability, updateLocation, updateDriverStatus)', () => {
    it('should validate updateAvailabilitySchema with boolean values', () => {
      assert.equal(updateAvailabilitySchema.parse({ isAvailable: true }).isAvailable, true);
      assert.equal(updateAvailabilitySchema.parse({ isAvailable: false }).isAvailable, false);
      assert.throws(() => updateAvailabilitySchema.parse({ isAvailable: 'true' as any }), ZodError);
    });

    it('should normalize and validate updateLocationSchema in various formats', () => {
      // { lat, lng }
      const format1 = updateLocationSchema.parse({ lat: 28.6139, lng: 77.209 });
      assert.equal(format1.lat, 28.6139);
      assert.equal(format1.lng, 77.209);

      // { latitude, longitude }
      const format2 = updateLocationSchema.parse({ latitude: 19.076, longitude: 72.8777 });
      assert.equal(format2.lat, 19.076);
      assert.equal(format2.lng, 72.8777);

      // { currentLat, currentLng }
      const format3 = updateLocationSchema.parse({ currentLat: 12.9716, currentLng: 77.5946 });
      assert.equal(format3.lat, 12.9716);
      assert.equal(format3.lng, 77.5946);
    });

    it('should reject invalid coordinates in updateLocationSchema', () => {
      assert.throws(() => updateLocationSchema.parse({ lat: 95, lng: 77 }), ZodError);
      assert.throws(() => updateLocationSchema.parse({ lat: 28, lng: 200 }), ZodError);
      assert.throws(() => updateLocationSchema.parse({}), ZodError);
    });

    it('should enforce status rules in updateDriverStatusSchema', () => {
      // Empty input should fail (at least one field required)
      assert.throws(() => updateDriverStatusSchema.parse({}), /At least one field/);

      // Single coordinate without the other should fail
      assert.throws(
        () => updateDriverStatusSchema.parse({ currentLat: 28.6 }),
        /Both currentLat and currentLng must be provided together/
      );

      // Valid paired coordinates and availability
      const valid = updateDriverStatusSchema.parse({
        isAvailable: true,
        currentLat: 28.6,
        currentLng: 77.2,
      });
      assert.equal(valid.isAvailable, true);
      assert.equal(valid.currentLat, 28.6);
    });
  });

  // ─── Ride & Common Validation Rules ───────────────────────────────────────
  describe('Ride & Common Validation Rules', () => {
    it('should validate valid createRideSchema input', () => {
      const valid = createRideSchema.parse({
        pickupAddress: 'Sector 17, Chandigarh',
        dropoffAddress: 'Elante Mall, Chandigarh',
        pickupLat: 30.7333,
        pickupLng: 76.7794,
        dropoffLat: 30.7056,
        dropoffLng: 76.8013,
        distanceKm: 4.5,
        durationMin: 12,
      });
      assert.equal(valid.pickupAddress, 'Sector 17, Chandigarh');
      assert.equal(valid.distanceKm, 4.5);
    });

    it('should reject empty pickup or dropoff addresses in createRideSchema', () => {
      assert.throws(() => createRideSchema.parse({
        pickupAddress: '',
        dropoffAddress: 'Somewhere',
      }), /Pickup address is required/);

      assert.throws(() => createRideSchema.parse({
        pickupAddress: 'Somewhere',
        dropoffAddress: '   ',
      }), /Dropoff address is required/);
    });

    it('should reject negative distance or duration in createRideSchema', () => {
      assert.throws(() => createRideSchema.parse({
        pickupAddress: 'A',
        dropoffAddress: 'B',
        distanceKm: -5,
      }), /Distance must be positive/);

      assert.throws(() => createRideSchema.parse({
        pickupAddress: 'A',
        dropoffAddress: 'B',
        durationMin: -2,
      }), /Duration must be positive/);
    });

    it('should validate idParamSchema correctly', () => {
      assert.equal(idParamSchema.parse({ id: 'ride-123' }).id, 'ride-123');
      assert.throws(() => idParamSchema.parse({ id: '' }), ZodError);
      assert.throws(() => idParamSchema.parse({ id: '   ' }), ZodError);
      assert.throws(() => idParamSchema.parse({}), ZodError);
    });

    it('should validate coordinatesSchema correctly', () => {
      const valid = coordinatesSchema.parse({ lat: 28.6, lng: 77.2 });
      assert.equal(valid.lat, 28.6);
      assert.equal(valid.lng, 77.2);
      assert.throws(() => coordinatesSchema.parse({ lat: -95, lng: 0 }), ZodError);
      assert.throws(() => coordinatesSchema.parse({ lat: 0, lng: 185 }), ZodError);
    });

    it('should validate rideFilterQuerySchema and reject invalid RideStatus', () => {
      const empty = rideFilterQuerySchema.parse({});
      assert.equal(empty.status, undefined);

      const validStatus = rideFilterQuerySchema.parse({ status: RideStatus.COMPLETED });
      assert.equal(validStatus.status, RideStatus.COMPLETED);

      assert.throws(() => rideFilterQuerySchema.parse({ status: 'NOT_A_VALID_STATUS' }), ZodError);
    });

    it('should validate rideHistoryQuerySchema with defaults and coercion', () => {
      const parsed = rideHistoryQuerySchema.parse({ limit: '15', offset: '5' });
      assert.equal(parsed.status, RideStatus.COMPLETED);
      assert.equal(parsed.limit, 15);
      assert.equal(parsed.offset, 5);
    });
  });

  // ─── Fare Validation Rules ────────────────────────────────────────────────
  describe('Fare Validation Rules', () => {
    it('should validate estimateFareFromLocationsSchema with flat coordinates', () => {
      const parsed = estimateFareFromLocationsSchema.parse({
        pickupLat: 28.6315,
        pickupLng: 77.2167,
        dropoffLat: 28.4952,
        dropoffLng: 77.0895,
        vehicleType: VehicleType.PREMIUM,
      });
      assert.equal(parsed.vehicleType, VehicleType.PREMIUM);
      assert.equal(parsed.pickupLat, 28.6315);
      assert.equal(parsed.dropoffLat, 28.4952);
    });

    it('should validate estimateFareFromLocationsSchema with nested coordinate objects', () => {
      const parsed = estimateFareFromLocationsSchema.parse({
        pickup: { lat: 28.6315, lng: 77.2167 },
        dropoff: { lat: 28.4952, lng: 77.0895 },
      });
      assert.equal(parsed.vehicleType, VehicleType.STANDARD);
      assert.equal(parsed.pickupLat, 28.6315);
      assert.equal(parsed.dropoffLng, 77.0895);
    });

    it('should reject missing coordinates in estimateFareFromLocationsSchema', () => {
      assert.throws(
        () => estimateFareFromLocationsSchema.parse({ pickupLat: 28.6315 }),
        ZodError
      );
    });

    it('should validate completeRideFareSchema with non-negative distance', () => {
      assert.equal(completeRideFareSchema.parse({ distanceKm: 12.4 }).distanceKm, 12.4);
      assert.equal(completeRideFareSchema.parse({ distanceKm: 0 }).distanceKm, 0);
      assert.equal(completeRideFareSchema.parse({}).distanceKm, undefined);
      assert.throws(() => completeRideFareSchema.parse({ distanceKm: -1 }), /non-negative/);
    });
  });

  // ─── Feedback Validation Rules ────────────────────────────────────────────
  describe('Feedback Validation Rules', () => {
    it('should accept valid rating (1 to 5) and optional comment', () => {
      const valid = createFeedbackSchema.parse({
        rating: 5,
        comment: 'Excellent and smooth ride!',
      });
      assert.equal(valid.rating, 5);
      assert.equal(valid.comment, 'Excellent and smooth ride!');
    });

    it('should reject rating below 1, above 5, or non-integer', () => {
      assert.throws(() => createFeedbackSchema.parse({ rating: 0 }), /Rating must be at least 1/);
      assert.throws(() => createFeedbackSchema.parse({ rating: 6 }), /Rating cannot exceed 5/);
      assert.throws(() => createFeedbackSchema.parse({ rating: 4.5 }), /Rating must be an integer/);
      assert.throws(() => createFeedbackSchema.parse({}), /Rating is required/);
    });

    it('should reject comment longer than 500 characters', () => {
      const longComment = 'a'.repeat(501);
      assert.throws(() => createFeedbackSchema.parse({ rating: 5, comment: longComment }), /cannot exceed 500 characters/);
    });
  });

  // ─── Matching & Location Validation Rules ─────────────────────────────────
  describe('Matching & Location Validation Rules', () => {
    it('should validate findNearbyDriversSchema with bounds and defaults', () => {
      const valid = findNearbyDriversSchema.parse({
        pickupLat: 28.6139,
        pickupLng: 77.209,
      });
      assert.equal(valid.pickupLat, 28.6139);
      assert.equal(valid.maxRadiusKm, 10.0);
      assert.equal(valid.limit, 10);
    });

    it('should reject out-of-bounds coordinates in findNearbyDriversSchema', () => {
      assert.throws(() => findNearbyDriversSchema.parse({ pickupLat: 95, pickupLng: 77 }), ZodError);
    });

    it('should validate assignDriverSchema requiring driverId', () => {
      assert.equal(assignDriverSchema.parse({ driverId: 'd-123' }).driverId, 'd-123');
      assert.throws(() => assignDriverSchema.parse({ driverId: '' }), ZodError);
      assert.throws(() => assignDriverSchema.parse({}), ZodError);
    });

    it('should validate calculateDistanceSchema and estimateRideSchema', () => {
      const dist = calculateDistanceSchema.parse({
        origin: { lat: 28.6, lng: 77.2 },
        destination: { lat: 28.7, lng: 77.3 },
        unit: 'km',
      });
      assert.equal(dist.unit, 'km');

      const est = estimateRideSchema.parse({
        pickup: { lat: 28.6, lng: 77.2 },
        dropoff: { lat: 28.7, lng: 77.3 },
        averageSpeedKmh: 40,
      });
      assert.equal(est.averageSpeedKmh, 40);
    });
  });

  // ─── Validation Middleware Unit Tests ─────────────────────────────────────
  describe('Validation Middleware (validateBody, validateQuery, validateParams, validateRequest)', () => {
    it('validateBody should pass valid body to next() and attach parsed data', () => {
      const middleware = validateBody(createFeedbackSchema);
      const req: any = { body: { rating: 4, comment: 'Good' } };
      let nextCalled = false;
      let errorPassed: any = null;

      middleware(req, {} as any, (err?: any) => {
        nextCalled = true;
        errorPassed = err;
      });

      assert.equal(nextCalled, true);
      assert.ok(!errorPassed);
      assert.equal(req.body.rating, 4);
    });

    it('validateBody should forward ZodError to next() on invalid input', () => {
      const middleware = validateBody(createFeedbackSchema);
      const req: any = { body: { rating: 10 } };
      let errorPassed: any = null;

      middleware(req, {} as any, (err?: any) => {
        errorPassed = err;
      });

      assert.ok(errorPassed instanceof ZodError);
      assert.ok(errorPassed.issues.some((i: any) => i.path.includes('rating')));
    });

    it('validateRequest should validate body, query, and params simultaneously', () => {
      const middleware = validateRequest({
        params: idParamSchema,
        body: createFeedbackSchema,
      });
      const req: any = {
        params: { id: 'ride-99' },
        body: { rating: 5 },
      };
      let nextCalled = false;
      middleware(req, {} as any, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(req.params.id, 'ride-99');
      assert.equal(req.body.rating, 5);
    });
  });
});
