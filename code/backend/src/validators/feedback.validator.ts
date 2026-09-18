import { z } from 'zod';
import { RideStatus } from '@prisma/client';

export const createFeedbackSchema = z.object({
  rating: z
    .number({ required_error: 'Rating is required' })
    .int('Rating must be an integer')
    .min(1, 'Rating must be at least 1')
    .max(5, 'Rating cannot exceed 5'),
  comment: z
    .string()
    .trim()
    .max(500, 'Comment cannot exceed 500 characters')
    .optional()
    .nullable(),
});

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;

export const rideHistoryQuerySchema = z.object({
  status: z
    .nativeEnum(RideStatus)
    .optional()
    .default(RideStatus.COMPLETED),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined)),
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined)),
});

export type RideHistoryQuery = z.infer<typeof rideHistoryQuerySchema>;
