import { z } from 'zod';
import { VehicleType } from '@prisma/client';

export const matchingOptionsSchema = z.object({
  maxRadiusKm: z.number().positive('Max radius must be positive').optional().default(10.0),
  vehicleType: z.nativeEnum(VehicleType).optional(),
  limit: z.number().int().positive().optional().default(10),
});

export type MatchingOptions = z.infer<typeof matchingOptionsSchema>;

export const findNearbyDriversSchema = z.object({
  pickupLat: z
    .number({ required_error: 'pickupLat is required' })
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90'),
  pickupLng: z
    .number({ required_error: 'pickupLng is required' })
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180'),
  maxRadiusKm: z.number().positive('Max radius must be positive').optional().default(10.0),
  vehicleType: z.nativeEnum(VehicleType).optional(),
  limit: z.number().int().positive().optional().default(10),
});

export type FindNearbyDriversInput = z.infer<typeof findNearbyDriversSchema>;

export const assignDriverSchema = z.object({
  driverId: z.string().min(1, 'driverId is required'),
});

export type AssignDriverInput = z.infer<typeof assignDriverSchema>;
