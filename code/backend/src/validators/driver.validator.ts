import { z } from 'zod';

export const updateAvailabilitySchema = z.object({
  isAvailable: z.boolean({
    required_error: 'Field isAvailable is required',
    invalid_type_error: 'Field isAvailable must be a boolean',
  }),
});

export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;

// Supports both {lat, lng} (Ayush's format) and {currentLat, currentLng} (Gurleen's format)
export const updateLocationSchema = z
  .object({
    lat: z.number().optional(),
    lng: z.number().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    currentLat: z.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90').optional(),
    currentLng: z.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180').optional(),
  })
  .transform((data) => ({
    lat: data.lat !== undefined ? data.lat : data.latitude !== undefined ? data.latitude : data.currentLat,
    lng: data.lng !== undefined ? data.lng : data.longitude !== undefined ? data.longitude : data.currentLng,
    currentLat: data.currentLat !== undefined ? data.currentLat : data.lat !== undefined ? data.lat : data.latitude,
    currentLng: data.currentLng !== undefined ? data.currentLng : data.lng !== undefined ? data.lng : data.longitude,
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
      currentLat: z.number().min(-90).max(90).optional(),
      currentLng: z.number().min(-180).max(180).optional(),
    })
  );

export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

export const updateDriverStatusSchema = z
  .object({
    isAvailable: z.boolean().optional(),
    currentLat: z
      .number()
      .min(-90, 'Latitude must be between -90 and 90')
      .max(90, 'Latitude must be between -90 and 90')
      .optional(),
    currentLng: z
      .number()
      .min(-180, 'Longitude must be between -180 and 180')
      .max(180, 'Longitude must be between -180 and 180')
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.isAvailable === undefined &&
      data.currentLat === undefined &&
      data.currentLng === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field (isAvailable, currentLat, currentLng) must be provided',
        path: [],
      });
    }

    if (
      (data.currentLat !== undefined && data.currentLng === undefined) ||
      (data.currentLat === undefined && data.currentLng !== undefined)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Both currentLat and currentLng must be provided together',
        path: data.currentLat === undefined ? ['currentLat'] : ['currentLng'],
      });
    }
  });

export type UpdateDriverStatusInput = z.infer<typeof updateDriverStatusSchema>;
