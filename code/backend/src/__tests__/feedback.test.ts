import { describe, it } from 'node:test';
import assert from 'node:assert';
import { RideStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { feedbackService } from '../services/feedback.service';
import { createFeedbackSchema } from '../validators/feedback.validator';
import {
  submitFeedback,
  getRideFeedback,
  getDriverFeedbacks,
} from '../controllers/feedback.controller';

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

describe('Task 20: Post-Ride Rating & Feedback Functionality', () => {
  const mockPassengerId = 'passenger-uuid-123';
  const mockOtherPassengerId = 'other-passenger-uuid-999';
  const mockDriverUserId = 'driver-user-uuid-456';
  const mockDriverId = 'driver-uuid-789';
  const mockRideId = 'ride-completed-1';

  const mockCompletedRide = {
    id: mockRideId,
    passengerId: mockPassengerId,
    driverId: mockDriverId,
    pickupAddress: 'Connaught Place, New Delhi',
    dropoffAddress: 'Cyber City, Gurugram',
    status: RideStatus.COMPLETED,
    driver: {
      id: mockDriverId,
      userId: mockDriverUserId,
      rating: 5.0,
    },
    feedbacks: [],
  };

  describe('Zod Validation - createFeedbackSchema', () => {
    it('should validate valid rating and comment', () => {
      const valid = { rating: 5, comment: 'Great driver, smooth trip!' };
      const parsed = createFeedbackSchema.safeParse(valid);
      assert.strictEqual(parsed.success, true);
      if (parsed.success) {
        assert.strictEqual(parsed.data.rating, 5);
        assert.strictEqual(parsed.data.comment, 'Great driver, smooth trip!');
      }
    });

    it('should allow rating without comment (optional feedback)', () => {
      const valid = { rating: 4 };
      const parsed = createFeedbackSchema.safeParse(valid);
      assert.strictEqual(parsed.success, true);
      if (parsed.success) {
        assert.strictEqual(parsed.data.rating, 4);
      }
    });

    it('should reject rating less than 1 or greater than 5', () => {
      const invalidLow = createFeedbackSchema.safeParse({ rating: 0 });
      assert.strictEqual(invalidLow.success, false);

      const invalidHigh = createFeedbackSchema.safeParse({ rating: 6 });
      assert.strictEqual(invalidHigh.success, false);
    });

    it('should reject non-integer ratings', () => {
      const invalid = createFeedbackSchema.safeParse({ rating: 4.5 });
      assert.strictEqual(invalid.success, false);
    });
  });

  describe('Feedback Service Layer', () => {
    it('should successfully submit feedback for a completed ride and recalculate driver rating', async () => {
      const originalRideFindUnique = prisma.ride.findUnique;
      const originalFeedbackFindFirst = prisma.feedback.findFirst;
      const originalFeedbackCreate = prisma.feedback.create;
      const originalFeedbackFindMany = prisma.feedback.findMany;
      const originalDriverUpdate = prisma.driver.update;

      let driverRatingUpdatedWith: number | null = null;

      prisma.ride.findUnique = (async () => mockCompletedRide) as any;
      prisma.feedback.findFirst = (async () => null) as any;
      prisma.feedback.create = (async (args: any) => ({
        id: 'feedback-uuid-1',
        rideId: mockRideId,
        userId: mockPassengerId,
        rating: args.data.rating,
        comment: args.data.comment,
        createdAt: new Date(),
        user: { id: mockPassengerId, name: 'John Passenger', email: 'john@example.com' },
        ride: { id: mockRideId, status: RideStatus.COMPLETED, driverId: mockDriverId },
      })) as any;
      prisma.feedback.findMany = (async () => [
        { rating: 5 },
        { rating: 4 },
      ]) as any;
      prisma.driver.update = (async (args: any) => {
        driverRatingUpdatedWith = args.data.rating;
        return { id: mockDriverId, rating: args.data.rating };
      }) as any;

      try {
        const feedback = await feedbackService.submitRideFeedback(mockRideId, mockPassengerId, {
          rating: 4,
          comment: 'Very polite driver',
        });

        assert.ok(feedback);
        assert.strictEqual(feedback.rating, 4);
        assert.strictEqual(feedback.comment, 'Very polite driver');
        // Average of [5, 4] is 4.5
        assert.strictEqual(driverRatingUpdatedWith, 4.5);
      } finally {
        prisma.ride.findUnique = originalRideFindUnique;
        prisma.feedback.findFirst = originalFeedbackFindFirst;
        prisma.feedback.create = originalFeedbackCreate;
        prisma.feedback.findMany = originalFeedbackFindMany;
        prisma.driver.update = originalDriverUpdate;
      }
    });

    it('should reject feedback submission if the ride is not COMPLETED', async () => {
      const originalRideFindUnique = prisma.ride.findUnique;
      prisma.ride.findUnique = (async () => ({
        ...mockCompletedRide,
        status: RideStatus.IN_PROGRESS,
      })) as any;

      try {
        await assert.rejects(
          async () => {
            await feedbackService.submitRideFeedback(mockRideId, mockPassengerId, {
              rating: 5,
            });
          },
          (err: any) => {
            assert.strictEqual(err.statusCode, 400);
            assert.ok(err.message.includes('Feedback can only be submitted for completed rides'));
            return true;
          }
        );
      } finally {
        prisma.ride.findUnique = originalRideFindUnique;
      }
    });

    it('should reject feedback submission if user is not the passenger of the ride', async () => {
      const originalRideFindUnique = prisma.ride.findUnique;
      prisma.ride.findUnique = (async () => mockCompletedRide) as any;

      try {
        await assert.rejects(
          async () => {
            await feedbackService.submitRideFeedback(mockRideId, mockOtherPassengerId, {
              rating: 5,
            });
          },
          (err: any) => {
            assert.strictEqual(err.statusCode, 403);
            assert.ok(err.message.includes('Forbidden: you can only submit feedback for your own rides'));
            return true;
          }
        );
      } finally {
        prisma.ride.findUnique = originalRideFindUnique;
      }
    });

    it('should reject duplicate feedback submission for the same ride', async () => {
      const originalRideFindUnique = prisma.ride.findUnique;
      const originalFeedbackFindFirst = prisma.feedback.findFirst;

      prisma.ride.findUnique = (async () => mockCompletedRide) as any;
      prisma.feedback.findFirst = (async () => ({
        id: 'existing-feedback-id',
        rideId: mockRideId,
        userId: mockPassengerId,
        rating: 5,
      })) as any;

      try {
        await assert.rejects(
          async () => {
            await feedbackService.submitRideFeedback(mockRideId, mockPassengerId, {
              rating: 5,
            });
          },
          (err: any) => {
            assert.strictEqual(err.statusCode, 409);
            assert.ok(err.message.includes('Feedback has already been submitted'));
            return true;
          }
        );
      } finally {
        prisma.ride.findUnique = originalRideFindUnique;
        prisma.feedback.findFirst = originalFeedbackFindFirst;
      }
    });
  });

  describe('Feedback Controller Endpoints', () => {
    it('should return 201 when submitting feedback via submitFeedback handler', async () => {
      const originalSubmit = feedbackService.submitRideFeedback;
      feedbackService.submitRideFeedback = async () => ({
        id: 'feedback-1',
        rideId: mockRideId,
        userId: mockPassengerId,
        rating: 5,
        comment: 'Excellent service',
      } as any);

      const req: any = {
        params: { id: mockRideId },
        user: { id: mockPassengerId },
        body: { rating: 5, comment: 'Excellent service' },
      };
      const res = createMockResponse();
      let nextError: any = null;

      try {
        await submitFeedback(req, res, (err: any) => {
          nextError = err;
        });

        assert.strictEqual(nextError, null);
        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.feedback.rating, 5);
        assert.strictEqual(res.body.data.feedback.comment, 'Excellent service');
      } finally {
        feedbackService.submitRideFeedback = originalSubmit;
      }
    });

    it('should return 200 when driver views their feedbacks via getDriverFeedbacks handler', async () => {
      const originalGetDriverFeedbacks = feedbackService.getDriverFeedbacks;
      feedbackService.getDriverFeedbacks = async () => ({
        averageRating: 4.8,
        totalFeedbacks: 1,
        feedbacks: [
          {
            id: 'feedback-1',
            rating: 5,
            comment: 'Great ride',
            createdAt: new Date(),
          },
        ] as any,
      });

      const req: any = {
        user: { id: mockDriverUserId },
      };
      const res = createMockResponse();
      let nextError: any = null;

      try {
        await getDriverFeedbacks(req, res, (err: any) => {
          nextError = err;
        });

        assert.strictEqual(nextError, null);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.averageRating, 4.8);
        assert.strictEqual(res.body.data.totalFeedbacks, 1);
      } finally {
        feedbackService.getDriverFeedbacks = originalGetDriverFeedbacks;
      }
    });
  });
});
