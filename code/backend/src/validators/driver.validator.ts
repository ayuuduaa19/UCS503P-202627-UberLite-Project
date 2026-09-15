import { z } from 'zod';

export const updateAvailabilitySchema = z.object({
  isAvailable: z.boolean({
    required_error: 'Field isAvailable is required',
    invalid_type_error: 'Field isAvailable must be a boolean',
  }),
});

export const updateLocationSchema = z
  .object({
    lat: z.number().optional(),
    lng: z.number().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  })
  .transform((data) => ({
    lat: data.lat !== undefined ? data.lat : data.latitude,
    lng: data.lng !== undefined ? data.lng : data.longitude,
  }))
  .pipe(
    z.object({
      lat: z
        .number({ required_error: 'Latitude is required and must be a number between -90 and 90' })
        .min(-90, 'Latitude must be between -90 and 90')
        .max(90, 'Latitude must be between -90 and 90'),
      lng: z
        .number({ required_error: 'Longitude is required and must be a number between -180 and 180' })
        .min(-180, 'Longitude must be between -180 and 180')
        .max(180, 'Longitude must be between -180 and 180'),
    })
  );

export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
