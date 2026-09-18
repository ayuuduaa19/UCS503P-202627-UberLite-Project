import { RideStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { CreateFeedbackInput } from '../validators/feedback.validator';

export class FeedbackService {
  /**
   * Submit post-ride rating and optional feedback for a completed ride.
   *
   * Business Rules:
   * 1. Only the passenger who took the ride can submit feedback.
   * 2. Feedback can only be submitted for completed rides (status === 'COMPLETED').
   * 3. Prevents duplicate feedback for the same ride by the same user.
   * 4. Updates the driver's overall aggregate rating based on all received ratings.
   */
  async submitRideFeedback(
    rideId: string,
    passengerUserId: string,
    input: CreateFeedbackInput
  ) {
    if (!rideId) {
      throw new AppError('Ride ID is required', 400);
    }

    // 1. Fetch the ride with driver and existing feedbacks
    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        driver: true,
        feedbacks: true,
      },
    });

    if (!ride) {
      throw new AppError('Ride not found', 404);
    }

    // 2. Verify passenger authorization
    if (ride.passengerId !== passengerUserId) {
      throw new AppError('Forbidden: you can only submit feedback for your own rides', 403);
    }

    // 3. Verify ride is completed
    if (ride.status !== RideStatus.COMPLETED) {
      throw new AppError(
        `Feedback can only be submitted for completed rides. Current ride status is '${ride.status}'`,
        400
      );
    }

    // 4. Verify driver is associated with the ride
    if (!ride.driverId || !ride.driver) {
      throw new AppError('Cannot submit feedback: No driver associated with this ride', 400);
    }

    // 5. Prevent duplicate feedback for the same ride by the same passenger
    const existingFeedback = await prisma.feedback.findFirst({
      where: {
        rideId,
        userId: passengerUserId,
      },
    });

    if (existingFeedback) {
      throw new AppError('Feedback has already been submitted for this ride', 409);
    }

    const { rating, comment } = input;

    // 6. Create feedback and re-calculate driver's average rating in a transaction
    const feedback = await prisma.feedback.create({
      data: {
        rideId,
        userId: passengerUserId,
        rating,
        comment: comment?.trim() || null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        ride: {
          select: {
            id: true,
            status: true,
            pickupAddress: true,
            dropoffAddress: true,
            driverId: true,
          },
        },
      },
    });

    // 7. Calculate new aggregate rating for driver
    const allDriverFeedbacks = await prisma.feedback.findMany({
      where: {
        ride: {
          driverId: ride.driverId,
        },
      },
      select: {
        rating: true,
      },
    });

    if (allDriverFeedbacks.length > 0) {
      const sumRatings = allDriverFeedbacks.reduce((acc, curr) => acc + curr.rating, 0);
      const avgRating = parseFloat((sumRatings / allDriverFeedbacks.length).toFixed(2));

      await prisma.driver.update({
        where: { id: ride.driverId },
        data: { rating: avgRating },
      });
    }

    return feedback;
  }

  /**
   * Get feedback for a specific ride
   */
  async getRideFeedback(rideId: string, requestingUserId: string) {
    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        driver: true,
      },
    });

    if (!ride) {
      throw new AppError('Ride not found', 404);
    }

    // Ensure only the ride's passenger or assigned driver can view feedback
    const isPassenger = ride.passengerId === requestingUserId;
    const isDriver = ride.driver?.userId === requestingUserId;

    if (!isPassenger && !isDriver) {
      throw new AppError('Forbidden: you are not authorized to view feedback for this ride', 403);
    }

    const feedbacks = await prisma.feedback.findMany({
      where: { rideId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return feedbacks;
  }

  /**
   * Get all feedbacks received by a driver
   */
  async getDriverFeedbacks(driverUserId: string) {
    const driver = await prisma.driver.findUnique({
      where: { userId: driverUserId },
    });

    if (!driver) {
      throw new AppError('Driver profile not found', 404);
    }

    const feedbacks = await prisma.feedback.findMany({
      where: {
        ride: {
          driverId: driver.id,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
        ride: {
          select: {
            id: true,
            pickupAddress: true,
            dropoffAddress: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      averageRating: driver.rating,
      totalFeedbacks: feedbacks.length,
      feedbacks,
    };
  }
}

export const feedbackService = new FeedbackService();
