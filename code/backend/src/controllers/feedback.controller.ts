import { Request, Response, NextFunction } from 'express';
import { feedbackService } from '../services/feedback.service';
import { createFeedbackSchema } from '../validators/feedback.validator';

/**
 * Submit post-ride rating and optional feedback for a completed ride.
 */
export const submitFeedback = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const passengerUserId = req.user!.id;
    const validatedData = createFeedbackSchema.parse(req.body);

    const feedback = await feedbackService.submitRideFeedback(
      id,
      passengerUserId,
      validatedData
    );

    return res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully',
      data: {
        feedback,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get feedback for a specific ride
 */
export const getRideFeedback = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const requestingUserId = req.user!.id;

    const feedbacks = await feedbackService.getRideFeedback(id, requestingUserId);

    return res.status(200).json({
      success: true,
      data: {
        feedbacks,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all feedbacks received by the authenticated driver
 */
export const getDriverFeedbacks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const driverUserId = req.user!.id;
    const result = await feedbackService.getDriverFeedbacks(driverUserId);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
