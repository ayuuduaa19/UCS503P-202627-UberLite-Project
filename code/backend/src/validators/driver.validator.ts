import { z } from 'zod';

export const updateAvailabilitySchema = z.object({
  isAvailable: z.boolean({
    required_error: 'Field isAvailable is required',
    invalid_type_error: 'Field isAvailable must be a boolean',
  }),
});

export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;

export const updateLocationSchema = z.object({
  currentLat: z
    .number({
      required_error: 'currentLat is required',
      invalid_type_error: 'currentLat must be a number',
    })
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90'),
  currentLng: z
    .number({
      required_error: 'currentLng is required',
      invalid_type_error: 'currentLng must be a number',
    })
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180'),
});

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
