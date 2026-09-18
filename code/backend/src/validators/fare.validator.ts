import { z } from 'zod';
import { VehicleType } from '@prisma/client';

export const estimateFareFromLocationsSchema = z
  .object({
    pickupLat: z.number().min(-90).max(90).optional(),
    pickupLng: z.number().min(-180).max(180).optional(),
    dropoffLat: z.number().min(-90).max(90).optional(),
    dropoffLng: z.number().min(-180).max(180).optional(),
    pickup: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .optional(),
    dropoff: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .optional(),
    vehicleType: z.nativeEnum(VehicleType).optional().default(VehicleType.STANDARD),
  })
  .transform((data) => {
    const pickupLat = data.pickupLat ?? data.pickup?.lat;
    const pickupLng = data.pickupLng ?? data.pickup?.lng;
    const dropoffLat = data.dropoffLat ?? data.dropoff?.lat;
    const dropoffLng = data.dropoffLng ?? data.dropoff?.lng;

    return {
      pickupLat,
      pickupLng,
      dropoffLat,
      dropoffLng,
      vehicleType: data.vehicleType,
    };
  })
  .refine(
    (data) =>
      data.pickupLat !== undefined &&
      data.pickupLng !== undefined &&
      data.dropoffLat !== undefined &&
      data.dropoffLng !== undefined,
    {
      message: 'Both pickup and dropoff coordinates (lat, lng) are required',
    }
  )
  .pipe(
    z.object({
      pickupLat: z.number().min(-90, 'Pickup latitude must be between -90 and 90').max(90, 'Pickup latitude must be between -90 and 90'),
      pickupLng: z.number().min(-180, 'Pickup longitude must be between -180 and 180').max(180, 'Pickup longitude must be between -180 and 180'),
      dropoffLat: z.number().min(-90, 'Dropoff latitude must be between -90 and 90').max(90, 'Dropoff latitude must be between -90 and 90'),
      dropoffLng: z.number().min(-180, 'Dropoff longitude must be between -180 and 180').max(180, 'Dropoff longitude must be between -180 and 180'),
      vehicleType: z.nativeEnum(VehicleType),
    })
  );

export type EstimateFareFromLocationsInput = z.infer<typeof estimateFareFromLocationsSchema>;

export const completeRideFareSchema = z.object({
  distanceKm: z.number().nonnegative('Recorded distance must be non-negative').optional(),
});

export type CompleteRideFareInput = z.infer<typeof completeRideFareSchema>;
