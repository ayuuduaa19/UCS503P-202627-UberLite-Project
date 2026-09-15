import { z } from 'zod';

const singleCoordinateSchema = z.union([
  z.object({
    lat: z
      .number({ required_error: 'Latitude is required' })
      .min(-90, 'Latitude must be between -90 and 90')
      .max(90, 'Latitude must be between -90 and 90'),
    lng: z
      .number({ required_error: 'Longitude is required' })
      .min(-180, 'Longitude must be between -180 and 180')
      .max(180, 'Longitude must be between -180 and 180'),
  }),
  z.object({
    latitude: z
      .number({ required_error: 'Latitude is required' })
      .min(-90, 'Latitude must be between -90 and 90')
      .max(90, 'Latitude must be between -90 and 90'),
    longitude: z
      .number({ required_error: 'Longitude is required' })
      .min(-180, 'Longitude must be between -180 and 180')
      .max(180, 'Longitude must be between -180 and 180'),
  }),
]);

export const calculateDistanceSchema = z.object({
  origin: singleCoordinateSchema,
  destination: singleCoordinateSchema,
  unit: z.enum(['km', 'm', 'miles']).default('km').optional(),
  decimals: z.number().int().min(0).max(6).default(2).optional(),
});

export const estimateRideSchema = z.object({
  pickup: singleCoordinateSchema,
  dropoff: singleCoordinateSchema,
  averageSpeedKmh: z.number().positive('Average speed must be greater than 0').max(200).default(30).optional(),
});

export type CalculateDistanceInput = z.infer<typeof calculateDistanceSchema>;
export type EstimateRideInput = z.infer<typeof estimateRideSchema>;
