import bcrypt from 'bcryptjs';
import { Role, VehicleType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { RegisterInput } from '../validators/auth.validator';

export class AuthService {
  async register(input: RegisterInput) {
    // 1. Check for existing user by email
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new AppError('A user with this email already exists', 409);
    }

    // 2. If registering as DRIVER, check for existing license number or vehicle plate
    if (input.role === 'DRIVER') {
      if (input.licenseNumber) {
        const existingLicense = await prisma.driver.findUnique({
          where: { licenseNumber: input.licenseNumber },
        });
        if (existingLicense) {
          throw new AppError('A driver with this license number already exists', 409);
        }
      }

      if (input.vehiclePlate) {
        const existingPlate = await prisma.driver.findUnique({
          where: { vehiclePlate: input.vehiclePlate },
        });
        if (existingPlate) {
          throw new AppError('A driver with this vehicle plate already exists', 409);
        }
      }
    }

    // 3. Hash password securely
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(input.password, saltRounds);

    // 4. Persist user and optional driver profile with Prisma
    try {
      if (input.role === 'DRIVER') {
        const user = await prisma.user.create({
          data: {
            email: input.email,
            password: hashedPassword,
            name: input.name,
            phone: input.phone || null,
            role: Role.DRIVER,
            driverProfile: {
              create: {
                licenseNumber: input.licenseNumber!,
                vehicleType: (input.vehicleType as VehicleType) || VehicleType.STANDARD,
                vehicleModel: input.vehicleModel!,
                vehiclePlate: input.vehiclePlate!,
                vehicleColor: input.vehicleColor || null,
              },
            },
          },
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            role: true,
            driverProfile: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        return user;
      }

      // Default: PASSENGER
      const user = await prisma.user.create({
        data: {
          email: input.email,
          password: hashedPassword,
          name: input.name,
          phone: input.phone || null,
          role: Role.PASSENGER,
        },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return user;
    } catch (error: any) {
      if (error.code === 'P2002') {
        const target = Array.isArray(error.meta?.target)
          ? error.meta.target.join(', ')
          : 'unique identifier';
        throw new AppError(`A record with this ${target} already exists`, 409);
      }
      throw error;
    }
  }
}

export const authService = new AuthService();
