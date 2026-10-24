import { z } from 'zod';
import { RideStatus, VehicleType } from '@prisma/client';

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
  search: z.string().trim().optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  minFare: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val !== undefined && val !== '' ? Number(val) : undefined)),
  maxFare: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val !== undefined && val !== '' ? Number(val) : undefined)),
  vehicleType: z.nativeEnum(VehicleType).optional(),
  rating: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val !== undefined && val !== '' ? Number(val) : undefined)),
  sortBy: z
    .enum(['date', 'createdAt', 'fare', 'totalFare', 'distance', 'distanceKm'])
    .optional()
    .default('date'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val !== undefined && val !== '' ? Number(val) : undefined)),
  offset: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val !== undefined && val !== '' ? Number(val) : undefined)),
});

export type RideHistoryQuery = z.infer<typeof rideHistoryQuerySchema>;
export const rideHistoryFilterSchema = rideHistoryQuerySchema;
export type RideHistoryFilterInput = RideHistoryQuery;
