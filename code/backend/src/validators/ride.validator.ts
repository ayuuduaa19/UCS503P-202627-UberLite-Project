import { z } from 'zod';

export const createRideSchema = z.object({
  pickupAddress: z
    .string({ required_error: 'Pickup address is required' })
    .trim()
    .min(1, 'Pickup address is required'),
  dropoffAddress: z
    .string({ required_error: 'Dropoff address is required' })
    .trim()
    .min(1, 'Dropoff address is required'),
  pickupLat: z
    .number({ invalid_type_error: 'pickupLat must be a number' })
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90')
    .optional()
    .default(0.0),
  pickupLng: z
    .number({ invalid_type_error: 'pickupLng must be a number' })
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180')
    .optional()
    .default(0.0),
  dropoffLat: z
    .number({ invalid_type_error: 'dropoffLat must be a number' })
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90')
    .optional()
    .default(0.0),
  dropoffLng: z
    .number({ invalid_type_error: 'dropoffLng must be a number' })
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180')
    .optional()
    .default(0.0),
  distanceKm: z.number().positive('Distance must be positive').optional(),
  durationMin: z.number().positive('Duration must be positive').optional(),
});

export type CreateRideInput = z.infer<typeof createRideSchema>;
