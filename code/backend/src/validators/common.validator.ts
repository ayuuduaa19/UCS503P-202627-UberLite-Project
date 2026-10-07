import { z } from 'zod';
import { RideStatus } from '@prisma/client';

export const idParamSchema = z.object({
  id: z
    .string({ required_error: 'ID parameter is required' })
    .trim()
    .min(1, 'ID parameter cannot be empty'),
});

export type IdParamInput = z.infer<typeof idParamSchema>;

export const coordinatesSchema = z.object({
  lat: z
    .number({ required_error: 'Latitude is required' })
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90'),
  lng: z
    .number({ required_error: 'Longitude is required' })
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180'),
});

export type CoordinatesInput = z.infer<typeof coordinatesSchema>;

export const rideFilterQuerySchema = z.object({
  status: z.nativeEnum(RideStatus).optional(),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined)),
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined)),
});

export type RideFilterQueryInput = z.infer<typeof rideFilterQuerySchema>;
