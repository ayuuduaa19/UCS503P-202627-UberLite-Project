import { z } from 'zod';

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters long'),
    email: z.string().trim().email('Invalid email address').toLowerCase(),
    password: z.string().min(6, 'Password must be at least 6 characters long'),
    phone: z.string().trim().optional(),
    role: z.enum(['PASSENGER', 'DRIVER']).default('PASSENGER'),
    licenseNumber: z.string().trim().optional(),
    vehicleType: z.enum(['STANDARD', 'PREMIUM', 'XL']).default('STANDARD').optional(),
    vehicleModel: z.string().trim().optional(),
    vehiclePlate: z.string().trim().optional(),
    vehicleColor: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === 'DRIVER') {
      if (!data.licenseNumber || data.licenseNumber.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'License number is required for driver registration',
          path: ['licenseNumber'],
        });
      }
      if (!data.vehicleModel || data.vehicleModel.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Vehicle model is required for driver registration',
          path: ['vehicleModel'],
        });
      }
      if (!data.vehiclePlate || data.vehiclePlate.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Vehicle plate is required for driver registration',
          path: ['vehiclePlate'],
        });
      }
    }
  });

export type RegisterInput = z.infer<typeof registerSchema>;
